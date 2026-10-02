// Phase 3G-6: Controlled Operational Automation — tests.
// Validates: closed rule catalog + tamper-evident mapping, account-scope rules
// (connection escalation, missing-resource investigation, resume proposal),
// sweep rules (backup failure, incident escalation), idempotency/cooldowns,
// the 3G-3 approval boundary (proposals only — never execution), RBAC,
// append-only evidence and audit logging.

import test from "node:test";
import assert from "node:assert/strict";
import { createDb, asUser, asService, rejects } from "./helpers/db.mjs";

const IDS = {
  pSupabase: "ffff0000-0000-0000-0000-000000000001",
  pVercel: "ffff0000-0000-0000-0000-000000000002",
  acctSupabase: "ffff0000-0000-0000-0000-000000000011",
  acctVercel: "ffff0000-0000-0000-0000-000000000012",
  sysA: "ffff0000-0000-0000-0000-000000000021",
  runD: "ffff0000-0000-0000-0000-000000000031",
  discPaused: "ffff0000-0000-0000-0000-000000000041",
  discVercel: "ffff0000-0000-0000-0000-000000000042",
  discMissing: "ffff0000-0000-0000-0000-000000000043",
  schedS: "ffff0000-0000-0000-0000-000000000051",
  monRun1: "ffff0000-0000-0000-0000-000000000061",
  monRun2: "ffff0000-0000-0000-0000-000000000062",
  reconRun1: "ffff0000-0000-0000-0000-000000000071",
  reconRun2: "ffff0000-0000-0000-0000-000000000072",
  polA: "ffff0000-0000-0000-0000-000000000081",
  incOld: "ffff0000-0000-0000-0000-000000000091",
  incNew: "ffff0000-0000-0000-0000-000000000092",
};

const ADMIN = "00000000-0000-0000-0000-000000000001";
const STAFF = "00000000-0000-0000-0000-000000000002";
const FINANCE = "00000000-0000-0000-0000-000000000003";
const CLIENT_A = "00000000-0000-0000-0000-000000000004";

const VAULT_STANDIN = `
CREATE SCHEMA vault;
CREATE TABLE vault.secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  secret text, name text, description text
);
CREATE FUNCTION vault.create_secret(text, text, text) RETURNS uuid
LANGUAGE sql AS $$
  INSERT INTO vault.secrets (secret, name, description) VALUES ($1,$2,$3) RETURNING id
$$;
CREATE VIEW vault.decrypted_secrets AS
  SELECT id, secret AS decrypted_secret FROM vault.secrets;
`;

async function setup(db) {
  await db.exec(VAULT_STANDIN);
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
      ('${IDS.pSupabase}', 'Supabase', 'supabase', 'supabase'),
      ('${IDS.pVercel}', 'Vercel', 'vercel', 'vercel')
    ON CONFLICT DO NOTHING;
    INSERT INTO public.provider_accounts (id, provider_id, account_name, ownership, client_id, connection_status, credential_reference)
      VALUES
      ('${IDS.acctSupabase}', '${IDS.pSupabase}', 'SCH Supabase', 'sch_managed', '${CLIENT_A}', 'connected', 'vault:test'),
      ('${IDS.acctVercel}', '${IDS.pVercel}', 'Vercel Prod', 'sch_managed', '${CLIENT_A}', 'connected', 'vault:test')
    ON CONFLICT DO NOTHING;
    INSERT INTO public.systems (id, client_id, name, system_type, status)
      VALUES ('${IDS.sysA}', '${CLIENT_A}', 'Client A System', 'web_platform', 'live') ON CONFLICT DO NOTHING;
    INSERT INTO public.provider_discovery_runs (id, provider_account_id, status, started_at, completed_at)
      VALUES ('${IDS.runD}', '${IDS.acctSupabase}', 'completed', now(), now())
    ON CONFLICT DO NOTHING;
  `);
}

/** Completed monitoring run + reconciliation run + a reconciliation item. */
async function downRun(db, monId, reconId, discId, resourceId, status = "PAUSED") {
  await asService(db, () => db.exec(`
    INSERT INTO public.provider_reconciliation_runs (id, provider_account_id, status, completed_at)
      VALUES ('${reconId}', '${IDS.acctSupabase}', 'completed', now());
    INSERT INTO public.provider_monitoring_runs
      (id, provider_account_id, trigger_source, status, reconciliation_run_id, started_at, completed_at)
      VALUES ('${monId}', '${IDS.acctSupabase}', 'scheduled', 'completed', '${reconId}', now(), now());
    INSERT INTO public.provider_reconciliation_items
      (run_id, provider_account_id, discovered_resource_id, resource_id, change_type,
       current_snapshot, change_fingerprint)
      VALUES ('${reconId}', '${IDS.acctSupabase}', '${discId}', ${resourceId ? `'${resourceId}'` : "NULL"},
              'unchanged', '{"status":"${status}"}', 'fp-${monId}');
  `));
}

async function evalAccount(db, succeeded = true) {
  return asService(db, async () =>
    (await db.query(
      `SELECT public.evaluate_account_automation('${IDS.acctSupabase}', NULL, ${succeeded}, 'scheduled', '${ADMIN}') AS r`
    )).rows[0].r);
}

async function evalSweep(db) {
  return asService(db, async () =>
    (await db.query(
      `SELECT public.evaluate_automation_sweep('${ADMIN}') AS r`
    )).rows[0].r);
}

function evalFor(result, ruleKey) {
  return (result.evaluations ?? []).filter((e) => e.rule_key === ruleKey);
}

// ---------------------------------------------------------------------------

test("3G6-1 schema: tables, RLS, catalog seeded, task key + action source", async () => {
  const db = await createDb();
  const { rows } = await db.query(`
    SELECT relname, relrowsecurity FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND relname IN ('automation_rules','automation_runs')`);
  assert.equal(rows.length, 2);
  for (const r of rows) assert.equal(r.relrowsecurity, true, `${r.relname} RLS`);

  const { rows: rules } = await db.query(
    `SELECT rule_key, risk_class, scope, enabled FROM public.automation_rules ORDER BY rule_key`);
  assert.equal(rules.length, 5);
  const map = Object.fromEntries(rules.map((r) => [r.rule_key, `${r.risk_class}:${r.scope}:${r.enabled}`]));
  assert.equal(map["connection_failure_escalation"], "internal_safe:account:true");
  assert.equal(map["linked_resource_missing_investigation"], "internal_safe:account:true");
  assert.equal(map["provider_resume_proposal"], "approval_required:account:true");
  assert.equal(map["backup_failure_escalation"], "internal_safe:sweep:true");
  assert.equal(map["incident_escalation"], "internal_safe:sweep:true");

  const { rows: idx } = await db.query(
    `SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname='uq_tasks_automation_open'`);
  assert.equal(idx.length, 1);
  const { rows: chk } = await db.query(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
     WHERE conrelid='public.action_items'::regclass AND conname='action_items_source_check'`);
  assert.ok(chk[0].def.includes("'automation'"));
});

test("3G6-2 catalog is closed + tamper-evident; rules cannot be deleted", async () => {
  const db = await createDb();
  await setup(db);
  await rejects(
    asService(db, () => db.query(
      `INSERT INTO public.automation_rules (rule_key, name, description, risk_class, scope)
       VALUES ('delete_client_infra', 'x', 'y', 'never_automate', 'sweep')`)),
    "unknown rule key rejected");
  await rejects(
    asService(db, () => db.query(
      `UPDATE public.automation_rules SET risk_class = 'internal_safe'
       WHERE rule_key = 'provider_resume_proposal'`)),
    "risk_class mapping is fixed");
  await rejects(
    asService(db, () => db.query(
      `DELETE FROM public.automation_rules`)),
    "rules cannot be deleted");
});

test("3G6-3 save_automation_rule: admin path works; staff/unknown keys rejected", async () => {
  const db = await createDb();
  await setup(db);
  await asService(db, () =>
    db.query(`SELECT public.save_automation_rule('incident_escalation', false, 48, 3600, '${ADMIN}')`));
  let { rows } = await asService(db, () =>
    db.query(`SELECT enabled, threshold, cooldown_seconds FROM public.automation_rules WHERE rule_key='incident_escalation'`));
  assert.equal(rows[0].enabled, false);
  assert.equal(rows[0].threshold, 48);
  assert.equal(rows[0].cooldown_seconds, 3600);

  await rejects(
    asService(db, () => db.query(
      `SELECT public.save_automation_rule('not_a_rule', true, 1, 60, '${ADMIN}')`)),
    "unknown rule key");
  // Authenticated principals cannot execute the RPC (grant revoked).
  await rejects(
    asUser(db, ADMIN, () => db.query(
      `SELECT public.save_automation_rule('incident_escalation', true, 24, 86400, '${ADMIN}')`)),
    "authenticated cannot execute save_automation_rule");
  await rejects(
    asUser(db, STAFF, () => db.query(
      `SELECT public.evaluate_automation_sweep('${STAFF}')`)),
    "staff cannot evaluate automation");
});

test("3G6-4 connection_failure_escalation: threshold → critical signal + deduped task", async () => {
  const db = await createDb();
  await setup(db);
  await asService(db, () => db.exec(`
    INSERT INTO public.provider_monitoring_schedules (id, provider_account_id, enabled, consecutive_failures)
      VALUES ('${IDS.schedS}', '${IDS.acctSupabase}', true, 3);
  `));

  // Below threshold → no action.
  await asService(db, () =>
    db.query(`UPDATE public.provider_monitoring_schedules SET consecutive_failures=1 WHERE id='${IDS.schedS}'`));
  let r = await evalAccount(db, false);
  assert.equal(evalFor(r, "connection_failure_escalation")[0].decision, "skipped_no_condition");

  // At threshold → signal escalated to critical + task created.
  await asService(db, () =>
    db.query(`UPDATE public.provider_monitoring_schedules SET consecutive_failures=3 WHERE id='${IDS.schedS}'`));
  r = await evalAccount(db, false);
  const ev = evalFor(r, "connection_failure_escalation")[0];
  assert.equal(ev.decision, "acted");
  const { rows: items } = await asService(db, () =>
    db.query(`SELECT severity, source FROM public.action_items`));
  assert.equal(items.length, 1);
  assert.equal(items[0].severity, "critical");
  const { rows: tasks } = await asService(db, () =>
    db.query(`SELECT title, priority, client_id, automation_key FROM public.tasks`));
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].priority, "high");
  assert.equal(tasks[0].client_id, CLIENT_A);
  assert.equal(tasks[0].automation_key, `auto:conn:${IDS.acctSupabase}`);

  // Re-evaluation while task is open → no duplicate (cooldown/duplicate).
  r = await evalAccount(db, false);
  assert.ok(
    ["skipped_cooldown", "skipped_duplicate"].includes(
      evalFor(r, "connection_failure_escalation")[0].decision));
  const { rows: n } = await asService(db, () =>
    db.query(`SELECT count(*)::int AS n FROM public.tasks`));
  assert.equal(n[0].n, 1, "no task storm");
});

test("3G6-5 linked_resource_missing_investigation: needs open incident; task links to it", async () => {
  const db = await createDb();
  await setup(db);
  await asService(db, () => db.exec(`
    INSERT INTO public.provider_discovered_resources
      (id, provider_account_id, external_resource_id, resource_type, name, status, last_run_id, external_missing)
    VALUES ('${IDS.discMissing}', '${IDS.acctSupabase}', 'prj-gone', 'project', 'Gone', 'ACTIVE_HEALTHY', '${IDS.runD}', true);
  `));
  await asService(db, () =>
    db.query(`SELECT public.link_discovered_resource('${IDS.discMissing}', '${CLIENT_A}', '${IDS.sysA}', '${ADMIN}')`));
  const { rows: rr } = await asService(db, () =>
    db.query(`SELECT linked_resource_id FROM public.provider_discovered_resources WHERE id='${IDS.discMissing}'`));
  const resId = rr[0].linked_resource_id;

  // Missing but no incident yet → no action.
  let r = await evalAccount(db, true);
  assert.equal(evalFor(r, "linked_resource_missing_investigation")[0].decision, "skipped_no_condition");

  // 3G-4-style incident on the resource → investigation task created.
  const { rows: inc } = await asService(db, () =>
    db.query(`INSERT INTO public.incidents (id, client_id, system_id, resource_id, title, description, severity, status, reported_by)
              VALUES (gen_random_uuid(), '${CLIENT_A}', '${IDS.sysA}', '${resId}',
                      'Provider resource unavailable', 'Missing externally', 'critical', 'open', '${ADMIN}')
              RETURNING id`));
  r = await evalAccount(db, true);
  const ev = evalFor(r, "linked_resource_missing_investigation")[0];
  assert.equal(ev.decision, "acted");
  const { rows: tasks } = await asService(db, () =>
    db.query(`SELECT incident_id, resource_id, client_id FROM public.tasks WHERE automation_key='auto:missing:${resId}'`));
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].incident_id, inc[0].id);
  assert.equal(tasks[0].client_id, CLIENT_A);

  // Repeat → dedupe.
  r = await evalAccount(db, true);
  assert.ok(
    ["skipped_cooldown", "skipped_duplicate"].includes(
      evalFor(r, "linked_resource_missing_investigation")[0].decision));
});

test("3G6-6 provider_resume_proposal: persistence gate → proposal; never executes", async () => {
  const db = await createDb();
  await setup(db);
  await asService(db, () => db.exec(`
    INSERT INTO public.provider_discovered_resources
      (id, provider_account_id, external_resource_id, resource_type, name, status, last_run_id, external_missing)
    VALUES ('${IDS.discPaused}', '${IDS.acctSupabase}', 'prj-paused', 'project', 'Paused', 'PAUSED', '${IDS.runD}', false);
    INSERT INTO public.provider_discovered_resources
      (id, provider_account_id, external_resource_id, resource_type, name, status, last_run_id, external_missing)
    VALUES ('${IDS.discVercel}', '${IDS.acctVercel}', 'dpl-x', 'project', 'Vercel', 'STOPPED', '${IDS.runD}', false);
  `));
  await asService(db, () =>
    db.query(`SELECT public.link_discovered_resource('${IDS.discPaused}', '${CLIENT_A}', '${IDS.sysA}', '${ADMIN}')`));
  await asService(db, () =>
    db.query(`SELECT public.link_discovered_resource('${IDS.discVercel}', '${CLIENT_A}', '${IDS.sysA}', '${ADMIN}')`));
  const { rows: rr } = await asService(db, () =>
    db.query(`SELECT linked_resource_id FROM public.provider_discovered_resources WHERE id='${IDS.discPaused}'`));
  const resId = rr[0].linked_resource_id;

  // One down observation < threshold 2 → no proposal.
  await downRun(db, IDS.monRun1, IDS.reconRun1, IDS.discPaused, resId);
  let r = await evalAccount(db, true);
  const first = evalFor(r, "provider_resume_proposal")[0];
  assert.equal(first.decision, "skipped_no_condition");

  // Second completed run still showing down → proposal.
  await downRun(db, IDS.monRun2, IDS.reconRun2, IDS.discPaused, resId);
  r = await evalAccount(db, true);
  const ev = evalFor(r, "provider_resume_proposal")[0];
  assert.equal(ev.decision, "proposal_created");
  const { rows: props } = await asService(db, () =>
    db.query(`SELECT id, operation_key, status, requested_by, basis_run_id, basis_snapshot
              FROM public.provider_operation_proposals`));
  assert.equal(props.length, 1);
  assert.equal(props[0].operation_key, "resume_resource");
  assert.equal(props[0].status, "proposed", "automation proposes — approval still required");
  assert.equal(props[0].requested_by, null, "automation proposal has no human requester");
  assert.equal(props[0].basis_run_id, IDS.runD);
  assert.equal(props[0].basis_snapshot.status, "PAUSED");

  // Vercel resource also down: capability matrix excludes it → no proposal.
  const { rows: all } = await asService(db, () =>
    db.query(`SELECT count(*)::int AS n FROM public.provider_operation_proposals`));
  assert.equal(all[0].n, 1, "unsupported provider produces no proposal");

  // The proposal CANNOT execute without explicit admin approval (3G-3 gate).
  await rejects(
    asService(db, () => db.query(
      `SELECT public.begin_provider_operation_execution('${props[0].id}', '${ADMIN}')`)),
    "unapproved proposal cannot execute");

  // Repeat evaluation → open proposal reused, not duplicated.
  r = await evalAccount(db, true);
  const ev2 = evalFor(r, "provider_resume_proposal")[0];
  assert.ok(["skipped_cooldown", "proposal_created"].includes(ev2.decision));
  const { rows: props2 } = await asService(db, () =>
    db.query(`SELECT count(*)::int AS n FROM public.provider_operation_proposals`));
  assert.equal(props2[0].n, 1, "single open proposal");
});

test("3G6-7 backup_failure_escalation: N failed → signal+task; healthy → resolved", async () => {
  const db = await createDb();
  await setup(db);
  await asService(db, () => db.exec(`
    INSERT INTO public.resources (id, client_id, system_id, provider_account_id, name, resource_type, status)
      VALUES (gen_random_uuid(), '${CLIENT_A}', '${IDS.sysA}', '${IDS.acctSupabase}', 'DB', 'database', 'active');
  `));
  const { rows: res } = await asService(db, () =>
    db.query(`SELECT id FROM public.resources WHERE name='DB'`));
  const resId = res[0].id;
  await asService(db, () => db.exec(`
    INSERT INTO public.backup_policies (id, client_id, resource_id, system_id, name, frequency, retention_days, created_by)
      VALUES ('${IDS.polA}', '${CLIENT_A}', '${resId}', '${IDS.sysA}', 'Nightly DB', 'daily', 30, '${ADMIN}');
    INSERT INTO public.backup_events (client_id, backup_policy_id, resource_id, system_id, status, recorded_by, failure_reason, created_at)
      VALUES
      ('${CLIENT_A}', '${IDS.polA}', '${resId}', '${IDS.sysA}', 'failed', '${ADMIN}', 'snapshot timeout', now() - interval '2 hours'),
      ('${CLIENT_A}', '${IDS.polA}', '${resId}', '${IDS.sysA}', 'missed', '${ADMIN}', NULL, now() - interval '1 hour');
  `));

  let r = await evalSweep(db);
  const ev = evalFor(r, "backup_failure_escalation")[0];
  assert.equal(ev.decision, "acted");
  const { rows: items } = await asService(db, () =>
    db.query(`SELECT severity, source, dedupe_key FROM public.action_items WHERE source='automation'`));
  assert.equal(items.length, 1);
  assert.equal(items[0].severity, "warning");
  const { rows: tasks } = await asService(db, () =>
    db.query(`SELECT resource_id, automation_key FROM public.tasks WHERE automation_key='auto:backup:${IDS.polA}'`));
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].resource_id, resId);

  // New successful event → evidence-based resolution of the open signal.
  await asService(db, () => db.exec(`
    INSERT INTO public.backup_events (client_id, backup_policy_id, resource_id, system_id, status, recorded_by)
      VALUES ('${CLIENT_A}', '${IDS.polA}', '${resId}', '${IDS.sysA}', 'successful', '${ADMIN}');
  `));
  r = await evalSweep(db);
  assert.equal(evalFor(r, "backup_failure_escalation")[0].decision, "resolved");
  const { rows: open } = await asService(db, () =>
    db.query(`SELECT count(*)::int AS n FROM public.action_items WHERE status IN ('open','acknowledged')`));
  assert.equal(open[0].n, 0, "recovery resolves the automation signal");
});

test("3G6-8 incident_escalation: stale unresolved incident → urgent task + signal", async () => {
  const db = await createDb();
  await setup(db);
  await asService(db, () => db.exec(`
    INSERT INTO public.incidents (id, client_id, system_id, title, description, severity, status, reported_by, opened_at)
      VALUES
      ('${IDS.incOld}', '${CLIENT_A}', '${IDS.sysA}', 'Old outage', 'Unresolved for days', 'high', 'open', '${ADMIN}', now() - interval '48 hours'),
      ('${IDS.incNew}', '${CLIENT_A}', '${IDS.sysA}', 'Fresh issue', 'Just opened', 'medium', 'open', '${ADMIN}', now());
  `));

  const r = await evalSweep(db);
  const evals = evalFor(r, "incident_escalation");
  const oldEval = evals.find((e) => e.scope_key === `inc:${IDS.incOld}`);
  assert.equal(oldEval.decision, "acted");
  assert.equal(evals.length, 1, "only the stale incident escalates");

  const { rows: tasks } = await asService(db, () =>
    db.query(`SELECT priority, incident_id FROM public.tasks WHERE automation_key='auto:escalation:${IDS.incOld}'`));
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].priority, "urgent");
  assert.equal(tasks[0].incident_id, IDS.incOld);
  const { rows: items } = await asService(db, () =>
    db.query(`SELECT severity, incident_id FROM public.action_items WHERE dedupe_key='auto:incident:${IDS.incOld}'`));
  assert.equal(items.length, 1);
  assert.equal(items[0].severity, "critical");

  // Incident itself untouched — automation never closes/resolves it.
  const { rows: inc } = await asService(db, () =>
    db.query(`SELECT status FROM public.incidents WHERE id='${IDS.incOld}'`));
  assert.equal(inc[0].status, "open");
});

test("3G6-9 idempotency: repeated sweeps never duplicate tasks or signals", async () => {
  const db = await createDb();
  await setup(db);
  await asService(db, () => db.exec(`
    INSERT INTO public.incidents (id, client_id, system_id, title, description, severity, status, reported_by, opened_at)
      VALUES ('${IDS.incOld}', '${CLIENT_A}', '${IDS.sysA}', 'Old outage', 'Unresolved', 'high', 'open', '${ADMIN}', now() - interval '48 hours');
  `));
  await evalSweep(db);
  await evalSweep(db);
  await evalSweep(db);
  const { rows: t } = await asService(db, () =>
    db.query(`SELECT count(*)::int AS n FROM public.tasks`));
  const { rows: a } = await asService(db, () =>
    db.query(`SELECT count(*)::int AS n FROM public.action_items WHERE status IN ('open','acknowledged')`));
  assert.equal(t[0].n, 1);
  assert.equal(a[0].n, 1);
});

test("3G6-10 disabled rule takes no action", async () => {
  const db = await createDb();
  await setup(db);
  await asService(db, () =>
    db.query(`SELECT public.save_automation_rule('incident_escalation', false, 24, 86400, '${ADMIN}')`));
  await asService(db, () => db.exec(`
    INSERT INTO public.incidents (id, client_id, system_id, title, description, severity, status, reported_by, opened_at)
      VALUES ('${IDS.incOld}', '${CLIENT_A}', '${IDS.sysA}', 'Old outage', 'Unresolved', 'high', 'open', '${ADMIN}', now() - interval '48 hours');
  `));
  const r = await evalSweep(db);
  assert.equal(evalFor(r, "incident_escalation")[0].decision, "skipped_disabled");
  const { rows: t } = await asService(db, () =>
    db.query(`SELECT count(*)::int AS n FROM public.tasks`));
  assert.equal(t[0].n, 0);
});

test("3G6-11 RBAC: rules admin+finance only; runs visible to staff; client blind", async () => {
  const db = await createDb();
  await setup(db);
  await asService(db, () => db.exec(`
    INSERT INTO public.incidents (id, client_id, system_id, title, description, severity, status, reported_by, opened_at)
      VALUES ('${IDS.incOld}', '${CLIENT_A}', '${IDS.sysA}', 'Old outage', 'Unresolved', 'high', 'open', '${ADMIN}', now() - interval '48 hours');
  `));
  await evalSweep(db);

  const { rows: a } = await asUser(db, ADMIN, () => db.query(`SELECT id FROM public.automation_rules`));
  const { rows: f } = await asUser(db, FINANCE, () => db.query(`SELECT id FROM public.automation_rules`));
  const { rows: s } = await asUser(db, STAFF, () => db.query(`SELECT id FROM public.automation_rules`));
  const { rows: c } = await asUser(db, CLIENT_A, () => db.query(`SELECT id FROM public.automation_rules`));
  assert.equal(a.length, 5);
  assert.equal(f.length, 5);
  assert.equal(s.length, 0, "staff cannot see rule configuration");
  assert.equal(c.length, 0);

  const { rows: ra } = await asUser(db, ADMIN, () => db.query(`SELECT id FROM public.automation_runs`));
  const { rows: rs } = await asUser(db, STAFF, () => db.query(`SELECT id FROM public.automation_runs`));
  const { rows: rc } = await asUser(db, CLIENT_A, () => db.query(`SELECT id FROM public.automation_runs`));
  assert.ok(ra.length > 0);
  assert.ok(rs.length > 0, "staff can triage automation evidence");
  assert.equal(rc.length, 0, "client sees no automation internals");

  // No direct writes for any authenticated role.
  await rejects(
    asUser(db, ADMIN, () => db.query(
      `INSERT INTO public.automation_runs (rule_id, rule_key, scope_key, trigger_source, decision)
       SELECT id, rule_key, 'x', 'manual', 'acted' FROM public.automation_rules LIMIT 1`)),
    "no direct automation_runs writes");
});

test("3G6-12 audit + append-only: evaluations and actions logged; runs undeletable", async () => {
  const db = await createDb();
  await setup(db);
  await asService(db, () => db.exec(`
    INSERT INTO public.incidents (id, client_id, system_id, title, description, severity, status, reported_by, opened_at)
      VALUES ('${IDS.incOld}', '${CLIENT_A}', '${IDS.sysA}', 'Old outage', 'Unresolved', 'high', 'open', '${ADMIN}', now() - interval '48 hours');
  `));
  await evalSweep(db);

  const { rows: acts } = await asService(db, () =>
    db.query(`SELECT DISTINCT action FROM public.audit_logs WHERE action LIKE 'automation.%'`));
  const actions = acts.map((x) => x.action);
  assert.ok(actions.includes("automation.evaluated"));
  assert.ok(actions.includes("automation.action_created"));

  await rejects(
    asService(db, () => db.query(`DELETE FROM public.automation_runs`)),
    "automation history is append-only");

  const { rows: sec } = await asService(db, () =>
    db.query(`SELECT detail FROM public.automation_runs WHERE detail IS NOT NULL`));
  for (const row of sec) {
    assert.ok(!/sk_|bearer |vault:|password|token/i.test(row.detail ?? ""), "no secret-shaped text in evidence");
  }
});

test("3G6-13 concurrent duplicate evaluation converges (single open task)", async () => {
  const db = await createDb();
  await setup(db);
  await asService(db, () => db.exec(`
    INSERT INTO public.provider_monitoring_schedules (id, provider_account_id, enabled, consecutive_failures)
      VALUES ('${IDS.schedS}', '${IDS.acctSupabase}', true, 3);
  `));
  // Simulate two evaluations racing for the same scope: whichever commits the
  // task first wins; the second finds the open task (automation_key unique).
  const [r1, r2] = await Promise.all([evalAccount(db, false), evalAccount(db, false)]);
  const decisions = [r1, r2].flatMap((r) =>
    evalFor(r, "connection_failure_escalation").map((e) => e.decision));
  const { rows: t } = await asService(db, () =>
    db.query(`SELECT count(*)::int AS n FROM public.tasks`));
  assert.equal(t[0].n, 1);
  assert.ok(decisions.length === 2);
});
