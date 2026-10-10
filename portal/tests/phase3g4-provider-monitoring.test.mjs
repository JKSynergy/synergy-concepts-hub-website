// Phase 3G-4: Provider Monitoring & Scheduled Reconciliation — tests.
// Validates: schema/RLS, schedule lifecycle, due selection, single-flight
// runs, deterministic classification → Action Center signals, incident
// creation + dedupe, auto-resolve on healthy observation, repeated-failure
// policy, credential safety, RBAC, delete safety, audit — and that nothing
// here can create/approve/execute a provider operation.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDb, asUser, asService, rejects, q } from "./helpers/db.mjs";

const IDS = {
  provider: "dddd0000-0000-0000-0000-000000000001",
  account: "dddd0000-0000-0000-0000-000000000002",
  sysA: "dddd0000-0000-0000-0000-000000000003",
  runD: "dddd0000-0000-0000-0000-000000000020",
  discLinked: "dddd0000-0000-0000-0000-000000000011",
  discUnlinked: "dddd0000-0000-0000-0000-000000000012",
};

const ADMIN = "00000000-0000-0000-0000-000000000001";
const STAFF = "00000000-0000-0000-0000-000000000002";
const FINANCE = "00000000-0000-0000-0000-000000000003";
const CLIENT_A = "00000000-0000-0000-0000-000000000004";

async function setup(db) {
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${ADMIN}', 'admin@synergy.ug'), ('${STAFF}', 'staff@synergy.ug'),
      ('${FINANCE}', 'finance@synergy.ug'), ('${CLIENT_A}', 'clienta@company.com')
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.profiles (id, email, role) VALUES
      ('${ADMIN}', 'admin@synergy.ug', 'admin'), ('${STAFF}', 'staff@synergy.ug', 'staff'),
      ('${FINANCE}', 'finance@synergy.ug', 'finance'), ('${CLIENT_A}', 'clienta@company.com', 'client')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
    INSERT INTO public.providers (id, name, slug, adapter_key) VALUES
      ('${IDS.provider}', 'Supabase', 'supabase', 'supabase')
    ON CONFLICT DO NOTHING;
    INSERT INTO public.provider_accounts (id, provider_id, account_name, ownership, connection_status, credential_reference)
      VALUES ('${IDS.account}', '${IDS.provider}', 'SCH Supabase', 'sch_managed', 'connected', 'vault:test')
    ON CONFLICT DO NOTHING;
    INSERT INTO public.systems (id, client_id, name, system_type, status)
      VALUES ('${IDS.sysA}', '${CLIENT_A}', 'Client A System', 'web_platform', 'live') ON CONFLICT DO NOTHING;
    INSERT INTO public.provider_discovery_runs (id, provider_account_id, status, started_at, completed_at)
      VALUES ('${IDS.runD}', '${IDS.account}', 'completed', now(), now())
    ON CONFLICT DO NOTHING;
  `);
}

async function insertDiscovered(db, id, { ext, name, status = "ACTIVE_HEALTHY", missing = false } = {}) {
  await asService(db, () => db.exec(`
    INSERT INTO public.provider_discovered_resources
      (id, provider_account_id, external_resource_id, resource_type, name, status, region, last_run_id, external_missing)
    VALUES ('${id}', '${IDS.account}', '${ext}', 'project', ${q(name)}, ${q(status)}, 'eu-west-1', '${IDS.runD}', ${missing})
    ON CONFLICT (id) DO NOTHING;
  `));
}

async function link(db, discId) {
  return asService(db, () =>
    db.query(`SELECT public.link_discovered_resource('${discId}', '${CLIENT_A}', '${IDS.sysA}', '${ADMIN}')`));
}

async function saveSchedule(db, freq = "daily", enabled = true) {
  return asService(db, async () =>
    (await db.query(
      `SELECT public.save_monitoring_schedule('${IDS.account}', '${freq}', ${enabled}, '${ADMIN}') AS id`
    )).rows[0].id);
}

async function beginRun(db, trigger = "manual") {
  const sched = await asService(db, async () =>
    (await db.query(
      `SELECT id FROM public.provider_monitoring_schedules WHERE provider_account_id = '${IDS.account}'`
    )).rows[0]);
  return asService(db, async () =>
    (await db.query(
      `SELECT public.begin_monitoring_run('${IDS.account}', '${trigger}', ${sched ? `'${sched.id}'` : "NULL"}, '${ADMIN}') AS r`
    )).rows[0].r);
}

async function runRecon(db) {
  return asService(db, async () =>
    (await db.query(
      `SELECT public.run_provider_reconciliation('${IDS.account}', '${ADMIN}') AS id`
    )).rows[0].id);
}

async function processRun(db, runId, reconId) {
  return asService(db, async () =>
    (await db.query(
      `SELECT public.process_monitoring_run('${runId}', '${ADMIN}', ${reconId ? `'${reconId}'` : "NULL"}) AS r`
    )).rows[0].r);
}

async function completeRun(db, runId, outcome, extra = {}) {
  return asService(db, async () =>
    (await db.query(
      `SELECT public.complete_monitoring_run('${runId}', '${outcome}',
         ${extra.discovery ? `'${extra.discovery}'` : "NULL"},
         ${extra.recon ? `'${extra.recon}'` : "NULL"},
         ${extra.changes ?? 0}, ${extra.signals ?? 0}, ${extra.incidents ?? 0},
         ${extra.error ? `'${extra.error}'` : "NULL"}) AS r`
    )).rows[0].r);
}

async function establishMonitoringBaseline(db) {
  const run = await beginRun(db, "manual");
  assert.equal(run.is_baseline, true);
  const recon = await runRecon(db);
  const result = await processRun(db, run.run_id, recon);
  assert.deepEqual(result, { changes_detected: 0, signals_created: 0, incidents_created: 0 });
  await completeRun(db, run.run_id, "completed", { recon });
  return { run, recon };
}

// ---------------------------------------------------------------------------

test("3G4-1 tables exist with RLS enabled", async () => {
  const db = await createDb();
  const { rows } = await db.query(`
    SELECT relname, relrowsecurity FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND relname IN ('provider_monitoring_schedules','provider_monitoring_runs','action_items')`);
  assert.equal(rows.length, 3);
  for (const r of rows) assert.equal(r.relrowsecurity, true, `${r.relname} RLS`);
});

test("3G4-2 schedule create/upsert + frequency vocabulary", async () => {
  const db = await createDb();
  await setup(db);
  const id = await saveSchedule(db, "daily", true);
  assert.ok(id);
  const { rows } = await asService(db, () =>
    db.query(`SELECT * FROM public.provider_monitoring_schedules WHERE provider_account_id = '${IDS.account}'`));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].frequency, "daily");
  assert.equal(rows[0].enabled, true);
  assert.ok(rows[0].next_run_at, "next_run_at set when enabled");

  // Upsert on same account updates, never duplicates.
  const id2 = await saveSchedule(db, "every_12_hours", false);
  assert.equal(id2, id);
  const { rows: after } = await asService(db, () =>
    db.query(`SELECT frequency, enabled, next_run_at FROM public.provider_monitoring_schedules WHERE provider_account_id = '${IDS.account}'`));
  assert.equal(after.length, 1);
  assert.equal(after[0].frequency, "every_12_hours");
  assert.equal(after[0].enabled, false);
  assert.equal(after[0].next_run_at, null, "disabled → no next_run_at");

  await rejects(
    asService(db, () => db.query(
      `SELECT public.save_monitoring_schedule('${IDS.account}', 'bogus', true, '${ADMIN}')`)),
    "invalid frequency");
});

test("3G4-3 non-admin cannot manage schedules (RBAC)", async () => {
  const db = await createDb();
  await setup(db);
  await rejects(
    asUser(db, STAFF, () => db.query(
      `SELECT public.save_monitoring_schedule('${IDS.account}', 'daily', true, '${STAFF}')`)),
    "staff save schedule");
  await rejects(
    asUser(db, FINANCE, () => db.query(
      `SELECT public.save_monitoring_schedule('${IDS.account}', 'daily', true, '${FINANCE}')`)),
    "finance save schedule");
  // Staff can't even read schedule table via RLS.
  const { rows } = await asUser(db, STAFF, () =>
    db.query(`SELECT * FROM public.provider_monitoring_schedules`));
  assert.equal(rows.length, 0);
});

test("3G4-4 due_monitoring_schedules returns only enabled+past-due", async () => {
  const db = await createDb();
  await setup(db);
  await saveSchedule(db, "every_6_hours", true);
  // Force due.
  await asService(db, () => db.exec(
    `UPDATE public.provider_monitoring_schedules SET next_run_at = now() - interval '1 minute' WHERE provider_account_id = '${IDS.account}'`));
  const { rows } = await asService(db, () => db.query(`SELECT * FROM public.due_monitoring_schedules()`));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].provider_account_id, IDS.account);

  // Disabled → not due.
  await saveSchedule(db, "every_6_hours", false);
  const { rows: none } = await asService(db, () => db.query(`SELECT * FROM public.due_monitoring_schedules()`));
  assert.equal(none.length, 0);
});

test("3G4-5 single-flight: second begin is skipped + audited", async () => {
  const db = await createDb();
  await setup(db);
  await saveSchedule(db, "daily", true);
  const a = await beginRun(db, "manual");
  assert.equal(a.outcome, "begin");
  const b = await beginRun(db, "scheduled");
  assert.equal(b.outcome, "skipped");
  assert.notEqual(b.run_id, a.run_id);
  const { rows } = await asService(db, () =>
    db.query(`SELECT status, error_category FROM public.provider_monitoring_runs ORDER BY started_at`));
  assert.deepEqual(rows.map((r) => r.status), ["running", "skipped"]);
  assert.equal(rows[1].error_category, "already_running");
});

test("3G4-6 failed run → consecutive_failures; threshold signal at 2", async () => {
  const db = await createDb();
  await setup(db);
  await saveSchedule(db, "daily", true);

  const r1 = await beginRun(db, "scheduled");
  await completeRun(db, r1.run_id, "failed", { error: "network_error" });
  let { rows: s } = await asService(db, () =>
    db.query(`SELECT consecutive_failures, last_failure_at FROM public.provider_monitoring_schedules WHERE provider_account_id = '${IDS.account}'`));
  assert.equal(s[0].consecutive_failures, 1);
  assert.ok(s[0].last_failure_at);
  let { rows: items } = await asService(db, () =>
    db.query(`SELECT * FROM public.action_items WHERE event_type = 'connection_failure'`));
  assert.equal(items.length, 0, "one transient failure does not surface a signal");

  const r2 = await beginRun(db, "scheduled");
  await completeRun(db, r2.run_id, "failed", { error: "auth_failed" });
  ({ rows: s } = await asService(db, () =>
    db.query(`SELECT consecutive_failures FROM public.provider_monitoring_schedules WHERE provider_account_id = '${IDS.account}'`)));
  assert.equal(s[0].consecutive_failures, 2);
  ({ rows: items } = await asService(db, () =>
    db.query(`SELECT severity, title FROM public.action_items WHERE event_type = 'discovery_failure'`)));
  assert.equal(items.length, 1);
  assert.equal(items[0].severity, "critical");
  assert.match(items[0].title, /authentication|permission/i);

  // Third failure refreshes (not duplicates) the signal.
  const r3 = await beginRun(db, "scheduled");
  await completeRun(db, r3.run_id, "failed", { error: "unavailable" });
  ({ rows: items } = await asService(db, () =>
    db.query(`SELECT count(*)::int AS n FROM public.action_items WHERE dedupe_key = 'mon:${IDS.account}:connection'`)));
  assert.equal(items[0].n, 1, "still one open provider signal");

  // Recovery clears it.
  const r4 = await beginRun(db, "scheduled");
  await completeRun(db, r4.run_id, "completed", {});
  ({ rows: items } = await asService(db, () =>
    db.query(`SELECT status FROM public.action_items WHERE dedupe_key = 'mon:${IDS.account}:connection'`)));
  assert.equal(items[0].status, "resolved");
  ({ rows: s } = await asService(db, () =>
    db.query(`SELECT consecutive_failures FROM public.provider_monitoring_schedules WHERE provider_account_id = '${IDS.account}'`)));
  assert.equal(s[0].consecutive_failures, 0);
});

test("3G4-7 first successful monitoring run establishes a signal-free baseline", async () => {
  const db = await createDb();
  await setup(db);
  await saveSchedule(db, "every_12_hours", true);
  await insertDiscovered(db, IDS.discUnlinked, { ext: "ext-unlinked", name: "Orphan Project" });

  const { run } = await establishMonitoringBaseline(db);
  const { rows: runs } = await asService(db, () =>
    db.query(`SELECT is_baseline, status, signals_created FROM public.provider_monitoring_runs WHERE id='${run.run_id}'`));
  assert.equal(runs[0].is_baseline, true);
  assert.equal(runs[0].status, "completed");
  assert.equal(runs[0].signals_created, 0);
  const { rows: items } = await asService(db, () =>
    db.query(`SELECT count(*)::int AS n FROM public.action_items`));
  assert.equal(items[0].n, 0, "baseline creates no mass signals");
});

test("3G4-8 linked resource down → critical signal + deduplicated incident", async () => {
  const db = await createDb();
  await setup(db);
  await saveSchedule(db, "daily", true);
  await insertDiscovered(db, IDS.discLinked, { ext: "ext-linked", name: "Prod DB" });
  await link(db, IDS.discLinked);

  await establishMonitoringBaseline(db);

  // Provider observes the resource go down.
  await asService(db, () => db.exec(
    `UPDATE public.provider_discovered_resources SET status = 'INACTIVE' WHERE id = '${IDS.discLinked}'`));
  const run = await beginRun(db, "scheduled");
  const recon1 = await runRecon(db);
  const res = await processRun(db, run.run_id, recon1);

  assert.equal(res.signals_created, 1);
  assert.equal(res.incidents_created, 1, "linked resource down → incident");

  const { rows: items } = await asService(db, () =>
    db.query(`SELECT severity, event_type, incident_id, resource_id FROM public.action_items`));
  assert.equal(items[0].event_type, "external_change");
  assert.equal(items[0].severity, "critical");
  assert.ok(items[0].incident_id);

  const { rows: inc } = await asService(db, () =>
    db.query(`SELECT severity, status, resource_id, client_id, system_id FROM public.incidents`));
  assert.equal(inc.length, 1);
  assert.equal(inc[0].severity, "high");
  assert.equal(inc[0].status, "open");
  assert.equal(inc[0].client_id, CLIENT_A);

  // Second monitoring run, still down → NO new incident (dedupe via open incident).
  const run2 = await beginRun(db, "scheduled");
  const recon2 = await runRecon(db);
  const res2 = await processRun(db, run2.run_id, recon2);
  const { rows: incAfter } = await asService(db, () =>
    db.query(`SELECT count(*)::int AS n FROM public.incidents`));
  assert.equal(incAfter[0].n, 1, "persistent condition → same incident");
  await completeRun(db, run.run_id, "completed", { recon: recon1 });
  await completeRun(db, run2.run_id, "completed", { recon: recon2 });
});

test("3G4-9 recovery auto-resolves signal; incident stays human-owned", async () => {
  const db = await createDb();
  await setup(db);
  await saveSchedule(db, "daily", true);
  await insertDiscovered(db, IDS.discLinked, { ext: "ext-linked", name: "Prod DB" });
  await link(db, IDS.discLinked);
  await establishMonitoringBaseline(db)

  // Down → signal + incident.
  await asService(db, () => db.exec(
    `UPDATE public.provider_discovered_resources SET status = 'INACTIVE' WHERE id = '${IDS.discLinked}'`));
  const run1 = await beginRun(db, "manual");
  const recon1 = await runRecon(db);
  await processRun(db, run1.run_id, recon1);
  await completeRun(db, run1.run_id, "completed", { recon: recon1 });

  // Back to healthy.
  await asService(db, () => db.exec(
    `UPDATE public.provider_discovered_resources SET status = 'ACTIVE_HEALTHY' WHERE id = '${IDS.discLinked}'`));
  const run2 = await beginRun(db, "scheduled");
  const recon2 = await runRecon(db);
  await processRun(db, run2.run_id, recon2);
  await completeRun(db, run2.run_id, "completed", { recon: recon2 });

  const { rows: items } = await asService(db, () =>
    db.query(`SELECT status FROM public.action_items ORDER BY detected_at`));
  // First signal resolved; recovery produced a new external_change item+signal
  // (INACTIVE→ACTIVE_HEALTHY is itself a status change) which then resolves.
  assert.ok(items.every((i) => i.status === "resolved"), "all signals resolved on healthy observation");

  const { rows: inc } = await asService(db, () =>
    db.query(`SELECT status FROM public.incidents`));
  assert.equal(inc.length, 1);
  assert.equal(inc[0].status, "open", "incident NOT auto-closed — human lifecycle");
});

test("3G4-10 missing_externally on linked resource → critical + incident", async () => {
  const db = await createDb();
  await setup(db);
  await saveSchedule(db, "daily", true);
  await insertDiscovered(db, IDS.discLinked, { ext: "ext-linked", name: "Prod DB" });
  await link(db, IDS.discLinked);
  await establishMonitoringBaseline(db);

  await asService(db, () => db.exec(
    `UPDATE public.provider_discovered_resources SET external_missing = true WHERE id = '${IDS.discLinked}'`));
  const run = await beginRun(db, "scheduled");
  const recon = await runRecon(db);
  const res = await processRun(db, run.run_id, recon);

  assert.equal(res.incidents_created, 1);
  const { rows: items } = await asService(db, () =>
    db.query(`SELECT severity, event_type FROM public.action_items`));
  assert.equal(items[0].event_type, "missing_externally");
  assert.equal(items[0].severity, "critical");
  const { rows: inc } = await asService(db, () =>
    db.query(`SELECT severity FROM public.incidents`));
  assert.equal(inc[0].severity, "critical");
});

test("3G4-11 monitoring never creates/approves/executes provider operations", async () => {
  const db = await createDb();
  await setup(db);
  await saveSchedule(db, "daily", true);
  await insertDiscovered(db, IDS.discLinked, { ext: "ext-linked", name: "Prod DB" });
  await link(db, IDS.discLinked);
  await establishMonitoringBaseline(db);
  await asService(db, () => db.exec(
    `UPDATE public.provider_discovered_resources SET status = 'INACTIVE' WHERE id = '${IDS.discLinked}'`));
  const run = await beginRun(db, "scheduled");
  const recon = await runRecon(db);
  await processRun(db, run.run_id, recon);
  await completeRun(db, run.run_id, "completed", { recon });

  const { rows } = await asService(db, () =>
    db.query(`SELECT count(*)::int AS n FROM public.provider_operation_proposals`));
  assert.equal(rows[0].n, 0, "zero operation proposals from monitoring");
});

test("3G4-12 secret-shaped signal titles are rejected at the DB layer", async () => {
  const db = await createDb();
  await setup(db);
  await rejects(
    asService(db, () => db.query(`
      INSERT INTO public.action_items (source, event_type, severity, title, dedupe_key)
      VALUES ('manual', 'general', 'info',
              'leaked: sk_live_' || 'a1b2c3d4e5f6a7b8c9d0', 'x1')`)),
    "secret in title");
});

test("3G4-13 runs and signals cannot be deleted (auditable history)", async () => {
  const db = await createDb();
  await setup(db);
  await saveSchedule(db, "daily", true);
  const run = await beginRun(db, "manual");
  await completeRun(db, run.run_id, "completed", {});
  await rejects(
    asService(db, () => db.query(`DELETE FROM public.provider_monitoring_runs WHERE id = '${run.run_id}'`)),
    "delete monitoring run");

  await asService(db, () => db.exec(`
    INSERT INTO public.action_items (source, event_type, severity, title, dedupe_key)
    VALUES ('manual', 'general', 'info', 'test signal', 'dedupe-x')`));
  await rejects(
    asService(db, () => db.query(`DELETE FROM public.action_items`)),
    "delete action items");
});

test("3G4-14 review_action_item transitions + staff allowed, client/finance denied", async () => {
  const db = await createDb();
  await setup(db);
  const { rows } = await asService(db, () => db.query(`
    INSERT INTO public.action_items (source, event_type, severity, title, dedupe_key)
    VALUES ('manual', 'general', 'warning', 'test signal', 'dedupe-y') RETURNING id`));
  const itemId = rows[0].id;

  // Staff may acknowledge (operational triage).
  const ack = await asService(db, async () =>
    (await db.query(`SELECT public.review_action_item('${itemId}','acknowledge','${STAFF}') AS s`)).rows[0].s);
  assert.equal(ack, "acknowledged");
  const res = await asService(db, async () =>
    (await db.query(`SELECT public.review_action_item('${itemId}','resolve','${STAFF}') AS s`)).rows[0].s);
  assert.equal(res, "resolved");

  const { rows: row } = await asService(db, () =>
    db.query(`SELECT status, resolved_by FROM public.action_items WHERE id = '${itemId}'`));
  assert.equal(row[0].status, "resolved");
  assert.equal(row[0].resolved_by, STAFF);

  // Direct RPC as end-user roles denied (service_role-only grants).
  await rejects(
    asUser(db, FINANCE, () => db.query(`SELECT public.review_action_item('${itemId}','resolve','${FINANCE}')`)),
    "finance review");
  await rejects(
    asUser(db, CLIENT_A, () => db.query(`SELECT public.review_action_item('${itemId}','resolve','${CLIENT_A}')`)),
    "client review");
});

test("3G4-21 repeated acknowledge is an atomic no-op — first reviewer attribution preserved", async () => {
  const db = await createDb();
  await setup(db);
  const { rows } = await asService(db, () => db.query(`
    INSERT INTO public.action_items (source, event_type, severity, title, dedupe_key)
    VALUES ('manual', 'general', 'warning', 'ack race signal', 'dedupe-ack') RETURNING id`));
  const itemId = rows[0].id;

  const first = await asService(db, async () =>
    (await db.query(`SELECT public.review_action_item('${itemId}','acknowledge','${STAFF}') AS s`)).rows[0].s);
  assert.equal(first, "acknowledged");

  // A repeated acknowledge (stale UI / retried call / concurrent reviewer)
  // must not overwrite the original acknowledged_by/at — atomic no-op.
  const again = await asService(db, async () =>
    (await db.query(`SELECT public.review_action_item('${itemId}','acknowledge','${ADMIN}') AS s`)).rows[0].s);
  assert.equal(again, "acknowledged");

  const { rows: row } = await asService(db, () =>
    db.query(`SELECT status, acknowledged_by FROM public.action_items WHERE id = '${itemId}'`));
  assert.equal(row[0].status, "acknowledged");
  assert.equal(row[0].acknowledged_by, STAFF);

  // Only one acknowledgement audit event was written — the no-op wrote nothing.
  const { rows: audit } = await asService(db, () =>
    db.query(`SELECT count(*)::int AS n FROM public.audit_logs
      WHERE table_name = 'action_items' AND record_id = '${itemId}' AND action = 'provider_monitoring.signal_acknowledged'`));
  assert.equal(audit[0].n, 1);
});

test("3G4-15 action_items readable by internal roles, not client", async () => {
  const db = await createDb();
  await setup(db);
  await asService(db, () => db.exec(`
    INSERT INTO public.action_items (source, event_type, severity, title, dedupe_key)
    VALUES ('manual', 'general', 'info', 'visible signal', 'dedupe-z')`));
  for (const [user, expect] of [[ADMIN, 1], [STAFF, 1], [FINANCE, 1], [CLIENT_A, 0]]) {
    const { rows } = await asUser(db, user, () =>
      db.query(`SELECT count(*)::int AS n FROM public.action_items`));
    assert.equal(rows[0].n, expect, `role visibility`);
  }
});

test("3G4-16 failed discovery path: run fails, no missing marking, no recon items", async () => {
  const db = await createDb();
  await setup(db);
  await saveSchedule(db, "daily", true);
  await insertDiscovered(db, IDS.discLinked, { ext: "ext-linked", name: "Prod DB" });
  await link(db, IDS.discLinked);
  await establishMonitoringBaseline(db);

  // Simulate a failed-discovery monitoring run: begin → fail. No
  // reconciliation is invoked; nothing may be marked missing.
  const run = await beginRun(db, "scheduled");
  await completeRun(db, run.run_id, "failed", { error: "no_credentials" });

  const { rows: disc } = await asService(db, () =>
    db.query(`SELECT external_missing FROM public.provider_discovered_resources WHERE id = '${IDS.discLinked}'`));
  assert.equal(disc[0].external_missing, false, "failed run cannot mark missing");

  const { rows: mon } = await asService(db, () =>
    db.query(`SELECT status, error_category FROM public.provider_monitoring_runs WHERE id = '${run.run_id}'`));
  assert.equal(mon[0].status, "failed");
  assert.equal(mon[0].error_category, "no_credentials");
});

test("3G4-17 audit trail records schedule/run/signal lifecycle", async () => {
  const db = await createDb();
  await setup(db);
  await saveSchedule(db, "daily", false);
  await saveSchedule(db, "daily", true); // enabled transition → schedule_enabled
  const run = await beginRun(db, "manual");
  await completeRun(db, run.run_id, "completed", {});

  const { rows: events } = await asService(db, () =>
    db.query(`SELECT action FROM public.audit_logs WHERE action LIKE 'provider_monitoring.%' ORDER BY created_at`));
  const actions = events.map((e) => e.action);
  assert.ok(actions.includes("provider_monitoring.schedule_created"));
  assert.ok(actions.includes("provider_monitoring.schedule_enabled"));
  assert.ok(actions.includes("provider_monitoring.started"));
  assert.ok(actions.includes("provider_monitoring.completed"));
});

test("3G4-18 skipped run is terminal (no completion overwrite)", async () => {
  const db = await createDb();
  await setup(db);
  await saveSchedule(db, "daily", true);
  const r1 = await beginRun(db, "manual");
  const r2 = await beginRun(db, "manual"); // skipped
  const res = await completeRun(db, r2.run_id, "completed", {});
  assert.equal(res, "already_completed");
  await completeRun(db, r1.run_id, "completed", {});
});

test("3G4-19 complete requires valid run + outcome", async () => {
  const db = await createDb();
  await setup(db);
  await rejects(
    asService(db, () => db.query(
      `SELECT public.complete_monitoring_run('00000000-0000-0000-0000-00000000dead', 'completed')`)),
    "missing run");
  const run = await beginRun(db, "manual");
  await rejects(
    asService(db, () => db.query(
      `SELECT public.complete_monitoring_run('${run.run_id}', 'bogus')`)),
    "bad outcome");
});

test("3G4-20 trigger_source is recorded (manual vs scheduled)", async () => {
  const db = await createDb();
  await setup(db);
  const r1 = await beginRun(db, "manual");
  await completeRun(db, r1.run_id, "completed", {});
  const r2 = await beginRun(db, "scheduled");
  await completeRun(db, r2.run_id, "completed", {});
  const { rows } = await asService(db, () =>
    db.query(`SELECT trigger_source FROM public.provider_monitoring_runs ORDER BY started_at`));
  assert.deepEqual(rows.map((r) => r.trigger_source), ["manual", "scheduled"]);
});

test("PHASE2-MON-1 every 12 hours is supported and recommended without auto-creating schedules", async () => {
  const db = await createDb();
  await setup(db);
  const id = await saveSchedule(db, "every_12_hours", false);
  const { rows } = await asService(db, () => db.query(
    `SELECT frequency, enabled, next_run_at FROM public.provider_monitoring_schedules WHERE id='${id}'`));
  assert.equal(rows[0].frequency, "every_12_hours");
  assert.equal(rows[0].enabled, false);
  assert.equal(rows[0].next_run_at, null);
});

test("PHASE2-MON-2 no-change run after baseline creates no signals", async () => {
  const db = await createDb();
  await setup(db);
  await saveSchedule(db, "every_12_hours", true);
  await insertDiscovered(db, IDS.discLinked, { ext: "stable", name: "Stable" });
  await link(db, IDS.discLinked);
  await establishMonitoringBaseline(db);
  const run = await beginRun(db, "scheduled");
  assert.equal(run.is_baseline, false);
  const recon = await runRecon(db);
  const result = await processRun(db, run.run_id, recon);
  assert.equal(result.changes_detected, 0);
  assert.equal(result.signals_created, 0);
});

test("PHASE2-MON-3 deployment timestamp and id-only changes are ignored", async () => {
  const db = await createDb();
  await setup(db);
  await saveSchedule(db, "every_12_hours", true);
  await insertDiscovered(db, IDS.discLinked, { ext: "vercel", name: "Frontend", status: "READY" });
  await asService(db, () => db.exec(`UPDATE public.provider_discovered_resources SET metadata = '{"production_domain":"example.com","environments":{"production":{"status":"READY"}},"latest_deployment":{"id":"dpl_old","status":"READY","created_at":"2026-01-01T00:00:00Z"}}' WHERE id='${IDS.discLinked}'`));
  await link(db, IDS.discLinked);
  await establishMonitoringBaseline(db);
  await asService(db, () => db.exec(`UPDATE public.provider_discovered_resources SET metadata = '{"production_domain":"example.com","environments":{"production":{"status":"READY"}},"latest_deployment":{"id":"dpl_new","status":"READY","created_at":"2026-02-01T00:00:00Z"}}' WHERE id='${IDS.discLinked}'`));
  const run = await beginRun(db, "scheduled");
  const recon = await runRecon(db);
  const result = await processRun(db, run.run_id, recon);
  assert.equal(result.changes_detected, 0);
  assert.equal(result.signals_created, 0);
});

test("PHASE2-MON-4 authentication failure surfaces immediately and repeated observation deduplicates", async () => {
  const db = await createDb();
  await setup(db);
  await saveSchedule(db, "every_12_hours", true);
  const first = await beginRun(db, "scheduled");
  await completeRun(db, first.run_id, "failed", { error: "auth_failed" });
  let { rows } = await asService(db, () => db.query(`SELECT severity, occurrence_count, status FROM public.action_items WHERE event_type='discovery_failure'`));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].severity, "critical");
  assert.equal(rows[0].occurrence_count, 1);
  const second = await beginRun(db, "scheduled");
  await completeRun(db, second.run_id, "failed", { error: "auth_failed" });
  ({ rows } = await asService(db, () => db.query(`SELECT occurrence_count FROM public.action_items WHERE event_type='discovery_failure'`)));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].occurrence_count, 2);
});

test("PHASE2-MON-5 successful recovery resolves an open authentication failure", async () => {
  const db = await createDb();
  await setup(db);
  await saveSchedule(db, "daily", true);
  const failed = await beginRun(db, "scheduled");
  await completeRun(db, failed.run_id, "failed", { error: "permission_denied" });
  const recovered = await beginRun(db, "scheduled");
  await completeRun(db, recovered.run_id, "completed", {});
  const { rows } = await asService(db, () => db.query(`SELECT status FROM public.action_items WHERE event_type='discovery_failure'`));
  assert.equal(rows[0].status, "resolved");
});

test("PHASE2-MON-6 scheduler and monitoring service remain protected and reuse discovery", () => {
  const route = readFileSync(new URL("../app/api/internal/provider-monitoring/run/route.ts", import.meta.url), "utf8");
  const service = readFileSync(new URL("../lib/monitoring/service.ts", import.meta.url), "utf8");
  assert.match(route, /CRON_SECRET/);
  assert.match(route, /return false/);
  assert.match(route, /status: 401/);
  assert.match(service, /executeProviderDiscovery/);
  assert.doesNotMatch(service, /api\.vercel\.com|backboard\.railway|providerMutate/);
});

test("PHASE2-MON-7 Vercel READY to ERROR signals and ERROR to READY resolves", async () => {
  const db = await createDb();
  await setup(db);
  await saveSchedule(db, "every_12_hours", true);
  await insertDiscovered(db, IDS.discLinked, { ext: "vercel-prod", name: "Vercel Frontend", status: "READY" });
  await link(db, IDS.discLinked);
  await establishMonitoringBaseline(db);
  await asService(db, () => db.exec(`UPDATE public.provider_discovered_resources SET status='ERROR' WHERE id='${IDS.discLinked}'`));
  const failedRun = await beginRun(db, "scheduled");
  const failedRecon = await runRecon(db);
  await processRun(db, failedRun.run_id, failedRecon);
  await completeRun(db, failedRun.run_id, "completed", { recon: failedRecon });
  let { rows } = await asService(db, () => db.query(`SELECT status, severity FROM public.action_items WHERE resource_id IS NOT NULL`));
  assert.equal(rows[0].status, "open");
  assert.equal(rows[0].severity, "critical");
  await asService(db, () => db.exec(`UPDATE public.provider_discovered_resources SET status='READY' WHERE id='${IDS.discLinked}'`));
  const recoveredRun = await beginRun(db, "scheduled");
  const recoveredRecon = await runRecon(db);
  await processRun(db, recoveredRun.run_id, recoveredRecon);
  await completeRun(db, recoveredRun.run_id, "completed", { recon: recoveredRecon });
  ({ rows } = await asService(db, () => db.query(`SELECT status FROM public.action_items WHERE resource_id IS NOT NULL`)));
  assert.ok(rows.every((row) => row.status === "resolved"));
});

test("PHASE2-MON-8 unlinked changes never create a System operational signal", async () => {
  const db = await createDb();
  await setup(db);
  await saveSchedule(db, "daily", true);
  await insertDiscovered(db, IDS.discUnlinked, { ext: "unlinked", name: "Similar System Name", status: "READY" });
  await establishMonitoringBaseline(db);
  await asService(db, () => db.exec(`UPDATE public.provider_discovered_resources SET status='ERROR' WHERE id='${IDS.discUnlinked}'`));
  const run = await beginRun(db, "scheduled");
  const recon = await runRecon(db);
  await processRun(db, run.run_id, recon);
  const { rows } = await asService(db, () => db.query(`SELECT count(*)::int AS n FROM public.action_items WHERE system_id IS NOT NULL`));
  assert.equal(rows[0].n, 0);
});

test("PHASE2-MON-9 manual discovery remains independent of monitoring schedules", () => {
  const actions = readFileSync(new URL("../lib/actions/provider-connections.ts", import.meta.url), "utf8");
  assert.match(actions, /executeProviderDiscovery\(admin, providerAccountId, user\.id\)/);
  assert.doesNotMatch(actions, /provider_monitoring_schedules/);
});
