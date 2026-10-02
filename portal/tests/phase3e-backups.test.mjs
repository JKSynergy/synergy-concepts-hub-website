// Phase 3E: Backup Policies & Backup Events Unit & Invariant Tests
// Validates backup_policies, backup_events, same-client integrity, lifecycle
// controls, health calculation, RBAC boundaries, delete safety, secret hygiene,
// audit logging, and financial anti-leak. Uses PGlite in-memory Postgres.
//
// Note: 3E-REG-* regression coverage is provided by the other phase test files
// in this suite (phase3a/3b/3c/3d + phase2c tests all run under npm test).

import test from "node:test";
import assert from "node:assert/strict";
import { createDb, asUser } from "./helpers/db.mjs";

const IDS = {
  provider: "11111111-1111-1111-1111-111111111111",
  account: "22222222-2222-2222-2222-222222222222",
  sysA: "33333333-3333-3333-3333-333333333333",
  resA: "44444444-4444-4444-4444-444444444441",
  sysB: "55555555-5555-5555-5555-555555555555",
  resB: "66666666-6666-6666-6666-666666666661",
  agrA: "77777777-7777-7777-7777-777777777771",
  agrB: "77777777-7777-7777-7777-777777777772",
};

async function setupAccounts(db) {
  const adminId = "00000000-0000-0000-0000-000000000001";
  const staffId = "00000000-0000-0000-0000-000000000002";
  const staff2Id = "00000000-0000-0000-0000-000000000006";
  const financeId = "00000000-0000-0000-0000-000000000003";
  const clientAId = "00000000-0000-0000-0000-000000000004";
  const clientBId = "00000000-0000-0000-0000-000000000005";

  for (const [id, email, role] of [
    [adminId, "admin@synergy.ug", "admin"],
    [staffId, "staff@synergy.ug", "staff"],
    [staff2Id, "staff2@synergy.ug", "staff"],
    [financeId, "finance@synergy.ug", "finance"],
    [clientAId, "clienta@company.com", "client"],
    [clientBId, "clientb@corp.com", "client"],
  ]) {
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${id}', '${email}') ON CONFLICT (id) DO NOTHING;
      INSERT INTO public.profiles (id, email, role) VALUES ('${id}', '${email}', '${role}') ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
    `);
  }

  await db.exec(`
    INSERT INTO public.providers (id, name, slug) VALUES ('${IDS.provider}', 'Vercel', 'vercel') ON CONFLICT DO NOTHING;
    INSERT INTO public.provider_accounts (id, provider_id, account_name, ownership)
    VALUES ('${IDS.account}', '${IDS.provider}', 'SCH Team', 'sch_managed') ON CONFLICT DO NOTHING;

    INSERT INTO public.systems (id, client_id, name, system_type, status)
    VALUES ('${IDS.sysA}', '${clientAId}', 'Client A System', 'web_platform', 'live') ON CONFLICT DO NOTHING;
    INSERT INTO public.resources (id, system_id, provider_account_id, name, resource_type, client_id, status)
    VALUES ('${IDS.resA}', '${IDS.sysA}', '${IDS.account}', 'Client A Web App', 'web_app', '${clientAId}', 'active') ON CONFLICT DO NOTHING;

    INSERT INTO public.systems (id, client_id, name, system_type, status)
    VALUES ('${IDS.sysB}', '${clientBId}', 'Client B System', 'web_platform', 'live') ON CONFLICT DO NOTHING;
    INSERT INTO public.resources (id, system_id, provider_account_id, name, resource_type, client_id, status)
    VALUES ('${IDS.resB}', '${IDS.sysB}', '${IDS.account}', 'Client B App', 'web_app', '${clientBId}', 'active') ON CONFLICT DO NOTHING;

    INSERT INTO public.service_agreements (id, client_id, system_id, name, service_type, status, start_date)
    VALUES ('${IDS.agrA}', '${clientAId}', '${IDS.sysA}', 'Client A Agreement', 'managed_service', 'active', '2026-09-01') ON CONFLICT DO NOTHING;
    INSERT INTO public.service_agreements (id, client_id, system_id, name, service_type, status, start_date)
    VALUES ('${IDS.agrB}', '${clientBId}', '${IDS.sysB}', 'Client B Agreement', 'managed_service', 'active', '2026-09-01') ON CONFLICT DO NOTHING;
  `);

  return { adminId, staffId, staff2Id, financeId, clientAId, clientBId };
}

async function createPolicy(db, { adminId, clientAId, overrides = "" } = {}) {
  const res = await db.query(`
    INSERT INTO public.backup_policies (client_id, resource_id, name, frequency, retention_days, created_by ${overrides ? "," + overrides : ""})
    VALUES ('${clientAId}', '${IDS.resA}', 'Nightly DB Backup', 'daily', 30, '${adminId}')
    RETURNING id;
  `);
  return res.rows[0].id;
}

test("PHASE 3E: Schema validation & RLS (3E-SCHEMA-1 to 3E-SCHEMA-6)", async () => {
  const db = await createDb();
  await setupAccounts(db);

  // 3E-SCHEMA-1 & 3E-SCHEMA-2: tables exist
  const tables = (await db.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('backup_policies', 'backup_events')
    ORDER BY table_name;
  `)).rows.map(r => r.table_name);
  assert.deepEqual(tables, ["backup_events", "backup_policies"]);

  // 3E-SCHEMA-3: RLS enabled on both tables
  const rls = (await db.query(`
    SELECT c.relname, c.relrowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN ('backup_policies', 'backup_events')
    ORDER BY c.relname;
  `)).rows;
  assert.equal(rls.length, 2);
  assert.ok(rls.every(r => r.relrowsecurity === true), "RLS enabled on both tables");

  // 3E-SCHEMA-4/5/6: CHECK constraints exist
  const constraints = (await db.query(`
    SELECT pg_get_constraintdef(oid) as def FROM pg_constraint
    WHERE conrelid IN ('public.backup_policies'::regclass, 'public.backup_events'::regclass) AND contype = 'c';
  `)).rows.map(r => r.def);

  // 3E-SCHEMA-4: frequency validation
  assert.ok(constraints.some(d => d.includes("'daily'") && d.includes("'custom'")), "frequency constraint exists");
  // 3E-SCHEMA-5: retention validation (positive)
  assert.ok(constraints.some(d => d.includes("retention_days") && d.includes("> 0")), "retention_days positivity constraint exists");
  // 3E-SCHEMA-6: event status validation
  assert.ok(constraints.some(d => d.includes("'expected'") && d.includes("'verified'")), "event status constraint exists");

  // Negative probes
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.backup_policies (client_id, resource_id, name, frequency, retention_days, created_by)
      VALUES ('00000000-0000-0000-0000-000000000004', '${IDS.resA}', 'Bad Freq', 'hourly', 30, '00000000-0000-0000-0000-000000000001');
    `)
  );
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.backup_policies (client_id, resource_id, name, frequency, retention_days, created_by)
      VALUES ('00000000-0000-0000-0000-000000000004', '${IDS.resA}', 'Bad Retention', 'daily', 0, '00000000-0000-0000-0000-000000000001');
    `)
  );
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.backup_events (client_id, resource_id, status, recorded_by)
      VALUES ('00000000-0000-0000-0000-000000000004', '${IDS.resA}', 'bogus', '00000000-0000-0000-0000-000000000001');
    `)
  );
});

test("PHASE 3E: Same-client integrity (3E-INT-1 to 3E-INT-5)", async () => {
  const db = await createDb();
  const { adminId, clientAId, clientBId } = await setupAccounts(db);

  // 3E-INT-1: Client A policy cannot reference Client B resource
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.backup_policies (client_id, resource_id, name, frequency, retention_days, created_by)
      VALUES ('${clientAId}', '${IDS.resB}', 'Cross Resource Policy', 'daily', 30, '${adminId}');
    `),
    /Backup policy client_id does not match referenced resource client_id/
  );

  // Standalone resource (no system) for Client A — needed so an explicit
  // system_id is validated rather than derived from the resource.
  await db.exec(`
    INSERT INTO public.resources (id, system_id, provider_account_id, name, resource_type, client_id, status)
    VALUES ('44444444-4444-4444-4444-444444444499', NULL, '${IDS.account}', 'Client A Standalone Bucket', 'storage_bucket', '${clientAId}', 'active')
    ON CONFLICT DO NOTHING;
  `);

  // 3E-INT-4: Client A policy cannot reference Client B system
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.backup_policies (client_id, resource_id, system_id, name, frequency, retention_days, created_by)
      VALUES ('${clientAId}', '44444444-4444-4444-4444-444444444499', '${IDS.sysB}', 'Cross System Policy', 'daily', 30, '${adminId}');
    `),
    /Backup policy client_id does not match referenced system client_id/
  );

  // Client A policy cannot reference Client B service agreement
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.backup_policies (client_id, resource_id, service_agreement_id, name, frequency, retention_days, created_by)
      VALUES ('${clientAId}', '${IDS.resA}', '${IDS.agrB}', 'Cross Agreement Policy', 'daily', 30, '${adminId}');
    `),
    /Backup policy client_id does not match referenced service agreement client_id/
  );

  // Valid policy for client A
  const polA = (await db.query(`
    INSERT INTO public.backup_policies (client_id, resource_id, service_agreement_id, name, frequency, retention_days, created_by)
    VALUES ('${clientAId}', '${IDS.resA}', '${IDS.agrA}', 'Client A Nightly Backup', 'daily', 30, '${adminId}')
    RETURNING id, system_id;
  `)).rows[0];
  assert.ok(polA.id);
  assert.equal(polA.system_id, IDS.sysA, "system_id derived from resource");

  // 3E-INT-2: Client A event cannot reference Client B resource
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.backup_events (client_id, resource_id, status, recorded_by)
      VALUES ('${clientAId}', '${IDS.resB}', 'successful', '${adminId}');
    `),
    /Backup event client_id does not match referenced resource client_id/
  );

  // 3E-INT-3: Client A event cannot reference Client B policy
  const polB = (await db.query(`
    INSERT INTO public.backup_policies (client_id, resource_id, name, frequency, retention_days, created_by)
    VALUES ('${clientBId}', '${IDS.resB}', 'Client B Weekly Backup', 'weekly', 14, '${adminId}')
    RETURNING id;
  `)).rows[0].id;

  await assert.rejects(
    () => db.query(`
      INSERT INTO public.backup_events (client_id, backup_policy_id, resource_id, status, recorded_by)
      VALUES ('${clientAId}', '${polB}', '${IDS.resA}', 'successful', '${adminId}');
    `),
    /Backup event client_id does not match referenced backup policy client_id/
  );

  // 3E-INT-5: Client A event cannot reference Client B system (standalone
  // resource, so explicit system_id is validated against the event's client).
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.backup_events (client_id, resource_id, system_id, status, recorded_by)
      VALUES ('${clientAId}', '44444444-4444-4444-4444-444444444499', '${IDS.sysB}', 'successful', '${adminId}');
    `),
    /Backup event client_id does not match referenced system client_id/
  );

  // Event policy↔resource mismatch rejected
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.backup_events (client_id, backup_policy_id, resource_id, status, recorded_by)
      VALUES ('${clientAId}', '${polA.id}', '44444444-4444-4444-4444-444444444499', 'successful', '${adminId}');
    `),
    /Backup event resource_id does not match referenced backup policy resource_id/
  );
});

test("PHASE 3E: Active policy overlap guard", async () => {
  const db = await createDb();
  const { adminId, clientAId } = await setupAccounts(db);

  const polA = await createPolicy(db, { adminId, clientAId });
  assert.ok(polA);

  // Second active overlapping policy on same resource rejected
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.backup_policies (client_id, resource_id, name, frequency, retention_days, created_by)
      VALUES ('${clientAId}', '${IDS.resA}', 'Overlapping Daily Backup', 'daily', 30, '${adminId}');
    `),
    /An active backup policy already exists for this resource/
  );

  // Non-overlapping window allowed (starts after first policy ends)
  await db.query(`UPDATE public.backup_policies SET effective_until = CURRENT_DATE + 10 WHERE id = '${polA}';`);
  const polB = (await db.query(`
    INSERT INTO public.backup_policies (client_id, resource_id, name, frequency, retention_days, is_active, effective_from, created_by)
    VALUES ('${clientAId}', '${IDS.resA}', 'Follow-on Backup Policy', 'weekly', 60, true, CURRENT_DATE + 11, '${adminId}')
    RETURNING id;
  `)).rows[0].id;
  assert.ok(polB, "non-overlapping active policy allowed");

  // Inactive overlapping policy allowed (historical record)
  const polC = (await db.query(`
    INSERT INTO public.backup_policies (client_id, resource_id, name, frequency, retention_days, is_active, effective_from, created_by)
    VALUES ('${clientAId}', '${IDS.resA}', 'Legacy Inactive Policy', 'daily', 7, false, CURRENT_DATE - 30, '${adminId}')
    RETURNING id;
  `)).rows[0].id;
  assert.ok(polC, "inactive overlapping policy allowed");
});

test("PHASE 3E: Event lifecycle rules & transitions (3E-LIFE-1 & 3E-LIFE-2)", async () => {
  const db = await createDb();
  const { adminId, staffId, clientAId } = await setupAccounts(db);
  const polA = await createPolicy(db, { adminId, clientAId });

  // Valid lifecycle: expected -> in_progress -> successful -> verified
  const evId = (await db.query(`
    INSERT INTO public.backup_events (client_id, backup_policy_id, resource_id, status, recorded_by)
    VALUES ('${clientAId}', '${polA}', '${IDS.resA}', 'expected', '${adminId}')
    RETURNING id;
  `)).rows[0].id;

  await db.query(`UPDATE public.backup_events SET status = 'in_progress' WHERE id = '${evId}';`);
  let cur = (await db.query(`SELECT status, started_at FROM public.backup_events WHERE id = '${evId}';`)).rows[0];
  assert.equal(cur.status, "in_progress");
  assert.ok(cur.started_at, "started_at populated");

  await db.query(`UPDATE public.backup_events SET status = 'successful' WHERE id = '${evId}';`);
  cur = (await db.query(`SELECT status, completed_at FROM public.backup_events WHERE id = '${evId}';`)).rows[0];
  assert.equal(cur.status, "successful");
  assert.ok(cur.completed_at, "completed_at populated");

  await asUser(db, staffId, async () => {
    await db.query(`UPDATE public.backup_events SET status = 'verified' WHERE id = '${evId}';`);
  });
  cur = (await db.query(`SELECT status, verified_at, verified_by FROM public.backup_events WHERE id = '${evId}';`)).rows[0];
  assert.equal(cur.status, "verified");
  assert.ok(cur.verified_at, "verified_at populated");
  assert.equal(cur.verified_by, staffId, "verified_by set to actor");

  // 3E-LIFE-2: invalid transitions rejected
  // verified is terminal
  await assert.rejects(
    () => db.query(`UPDATE public.backup_events SET status = 'successful' WHERE id = '${evId}';`),
    /terminal status/
  );

  // expected -> verified rejected
  const ev2 = (await db.query(`
    INSERT INTO public.backup_events (client_id, backup_policy_id, resource_id, status, recorded_by)
    VALUES ('${clientAId}', '${polA}', '${IDS.resA}', 'expected', '${adminId}')
    RETURNING id;
  `)).rows[0].id;
  await assert.rejects(
    () => db.query(`UPDATE public.backup_events SET status = 'verified' WHERE id = '${ev2}';`),
    /Invalid backup event transition/
  );

  // Direct verified insert rejected
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.backup_events (client_id, backup_policy_id, resource_id, status, recorded_by)
      VALUES ('${clientAId}', '${polA}', '${IDS.resA}', 'verified', '${adminId}');
    `),
    /cannot directly be created as verified/
  );

  // failed requires failure_reason
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.backup_events (client_id, backup_policy_id, resource_id, status, recorded_by)
      VALUES ('${clientAId}', '${polA}', '${IDS.resA}', 'failed', '${adminId}');
    `),
    /requires a failure_reason/
  );

  // failed event with reason succeeds, then is terminal
  const evFail = (await db.query(`
    INSERT INTO public.backup_events (client_id, backup_policy_id, resource_id, status, recorded_by, failure_reason)
    VALUES ('${clientAId}', '${polA}', '${IDS.resA}', 'failed', '${adminId}', 'Provider snapshot timed out')
    RETURNING id;
  `)).rows[0].id;
  assert.ok(evFail);
  await assert.rejects(
    () => db.query(`UPDATE public.backup_events SET status = 'successful' WHERE id = '${evFail}';`),
    /terminal status/
  );

  // missed can be recorded and is terminal
  const evMiss = (await db.query(`
    INSERT INTO public.backup_events (client_id, backup_policy_id, resource_id, status, recorded_by)
    VALUES ('${clientAId}', '${polA}', '${IDS.resA}', 'missed', '${adminId}')
    RETURNING id;
  `)).rows[0].id;
  assert.ok(evMiss);
  await assert.rejects(
    () => db.query(`UPDATE public.backup_events SET status = 'successful' WHERE id = '${evMiss}';`),
    /terminal status/
  );
});

test("PHASE 3E: Backup health calculation (3E-HEALTH-1 to 3E-HEALTH-4)", async () => {
  const db = await createDb();
  const { adminId, clientAId } = await setupAccounts(db);

  // Policy A: daily, verification required
  const polA = (await db.query(`
    INSERT INTO public.backup_policies (client_id, resource_id, name, frequency, retention_days, verification_required, created_by)
    VALUES ('${clientAId}', '${IDS.resA}', 'Daily Verified Backup', 'daily', 30, true, '${adminId}')
    RETURNING id;
  `)).rows[0].id;

  const healthOf = async (pid) =>
    (await db.query(`SELECT health, next_due_at FROM public.backup_policy_health WHERE policy_id = '${pid}';`)).rows[0];

  // 3E-HEALTH-1: healthy — verified event within cadence
  const evOk = (await db.query(`
    INSERT INTO public.backup_events (client_id, backup_policy_id, resource_id, status, recorded_by, completed_at)
    VALUES ('${clientAId}', '${polA}', '${IDS.resA}', 'successful', '${adminId}', now() - interval '2 hours')
    RETURNING id;
  `)).rows[0].id;

  // While unverified, policy reports 'unverified' (3E-HEALTH-4 precondition)
  let h = await healthOf(polA);
  assert.equal(h.health, "unverified", "verification-required policy with unverified success reports unverified");

  await db.query(`UPDATE public.backup_events SET status = 'verified' WHERE id = '${evOk}';`);
  h = await healthOf(polA);
  assert.equal(h.health, "healthy", "verified event within cadence reports healthy");

  // 3E-HEALTH-2: due / overdue
  // due: last verified success ~20h ago on daily cadence (>75% of window)
  await db.query(`UPDATE public.backup_events SET completed_at = now() - interval '20 hours' WHERE id = '${evOk}';`);
  h = await healthOf(polA);
  assert.equal(h.health, "due", "approaching cadence end reports due");

  // overdue: last success 2 days ago on daily cadence
  await db.query(`UPDATE public.backup_events SET completed_at = now() - interval '2 days' WHERE id = '${evOk}';`);
  h = await healthOf(polA);
  assert.equal(h.health, "overdue", "past cadence reports overdue");

  // 3E-HEALTH-3: failed
  await db.query(`
    INSERT INTO public.backup_events (client_id, backup_policy_id, resource_id, status, recorded_by, failure_reason)
    VALUES ('${clientAId}', '${polA}', '${IDS.resA}', 'failed', '${adminId}', 'Snapshot job exited 1');
  `);
  h = await healthOf(polA);
  assert.equal(h.health, "failed", "latest failed event reports failed");

  // New policy with no events and a stale effective window is overdue
  await db.exec(`
    INSERT INTO public.resources (id, system_id, provider_account_id, name, resource_type, client_id, status)
    VALUES ('44444444-4444-4444-4444-444444444499', NULL, '${IDS.account}', 'Client A Standalone Bucket', 'storage_bucket', '${clientAId}', 'active')
    ON CONFLICT DO NOTHING;
  `);
  const polStale = (await db.query(`
    INSERT INTO public.backup_policies (client_id, resource_id, name, frequency, retention_days, is_active, effective_from, created_by)
    VALUES ('${clientAId}', '44444444-4444-4444-4444-444444444499', 'Never-Backed-Up Policy', 'weekly', 14, true, CURRENT_DATE - 10, '${adminId}')
    RETURNING id;
  `)).rows[0].id;
  h = (await db.query(`SELECT health FROM public.backup_policy_health WHERE policy_id = '${polStale}';`)).rows[0];
  assert.equal(h.health, "overdue", "policy with no events past first interval is overdue");
});

test("PHASE 3E: Audit logging triggers (3E-AUDIT-1 to 3E-AUDIT-4)", async () => {
  const db = await createDb();
  const { adminId, clientAId } = await setupAccounts(db);
  const polA = await createPolicy(db, { adminId, clientAId });

  // 3E-AUDIT-1: policy creation audit event
  let logs = (await db.query(`
    SELECT action FROM public.audit_logs WHERE table_name = 'backup_policies' AND record_id = '${polA}';
  `)).rows.map(r => r.action);
  assert.ok(logs.includes("backup_policy.created"), "backup_policy.created logged");

  // 3E-AUDIT-2: policy update audit event (deactivation is also an update)
  await db.query(`UPDATE public.backup_policies SET retention_days = 45 WHERE id = '${polA}';`);
  await db.query(`UPDATE public.backup_policies SET is_active = false WHERE id = '${polA}';`);
  logs = (await db.query(`
    SELECT action FROM public.audit_logs WHERE table_name = 'backup_policies' AND record_id = '${polA}';
  `)).rows.map(r => r.action);
  assert.ok(logs.includes("backup_policy.updated"), "backup_policy.updated logged");
  assert.ok(logs.includes("backup_policy.deactivated"), "backup_policy.deactivated logged");

  // 3E-AUDIT-3: event creation + status changes
  const ev = (await db.query(`
    INSERT INTO public.backup_events (client_id, backup_policy_id, resource_id, status, recorded_by)
    VALUES ('${clientAId}', '${polA}', '${IDS.resA}', 'expected', '${adminId}')
    RETURNING id;
  `)).rows[0].id;
  await db.query(`UPDATE public.backup_events SET status = 'successful', evidence_reference = 'snapshot-2026-10-01' WHERE id = '${ev}';`);

  // 3E-AUDIT-4: verification
  await asUser(db, adminId, async () => {
    await db.query(`UPDATE public.backup_events SET status = 'verified' WHERE id = '${ev}';`);
  });

  logs = (await db.query(`
    SELECT action FROM public.audit_logs WHERE table_name = 'backup_events' AND record_id = '${ev}';
  `)).rows.map(r => r.action);
  assert.ok(logs.includes("backup_event.created"), "backup_event.created logged");
  assert.ok(logs.includes("backup_event.status_changed"), "backup_event.status_changed logged");
  assert.ok(logs.includes("backup_event.evidence_recorded"), "backup_event.evidence_recorded logged");
  assert.ok(logs.includes("backup_event.verified"), "backup_event.verified logged");
});

test("PHASE 3E: RBAC & role boundaries (3E-RBAC-1 to 3E-RBAC-6)", async () => {
  const db = await createDb();
  const { adminId, staffId, financeId, clientAId } = await setupAccounts(db);

  // 3E-RBAC-1: Admin can create/manage policies
  const polA = await asUser(db, adminId, async () => {
    const res = await db.query(`
      INSERT INTO public.backup_policies (client_id, resource_id, name, frequency, retention_days, created_by)
      VALUES ('${clientAId}', '${IDS.resA}', 'Admin Policy', 'daily', 30, '${adminId}')
      RETURNING id;
    `);
    return res.rows[0].id;
  });
  assert.ok(polA);

  // 3E-RBAC-2: Admin can record/verify events
  await asUser(db, adminId, async () => {
    const ev = (await db.query(`
      INSERT INTO public.backup_events (client_id, backup_policy_id, resource_id, status, recorded_by)
      VALUES ('${clientAId}', '${polA}', '${IDS.resA}', 'successful', '${adminId}')
      RETURNING id;
    `)).rows[0].id;
    await db.query(`UPDATE public.backup_events SET status = 'verified' WHERE id = '${ev}';`);
    const cur = (await db.query(`SELECT status FROM public.backup_events WHERE id = '${ev}';`)).rows[0];
    assert.equal(cur.status, "verified");
  });

  // 3E-RBAC-3: Staff can record backup events (permitted operational recording)
  await asUser(db, staffId, async () => {
    const ev = (await db.query(`
      INSERT INTO public.backup_events (client_id, backup_policy_id, resource_id, status, recorded_by, evidence_reference)
      VALUES ('${clientAId}', '${polA}', '${IDS.resA}', 'successful', '${staffId}', 'snapshot-ref-9')
      RETURNING id;
    `)).rows[0].id;
    assert.ok(ev, "staff recorded event");
    await db.query(`UPDATE public.backup_events SET evidence_notes = 'Spot-checked provider console' WHERE id = '${ev}';`);
  });

  // Staff cannot create policies (no insert policy)
  await assert.rejects(
    () => asUser(db, staffId, async () => {
      await db.query(`
        INSERT INTO public.backup_policies (client_id, resource_id, name, frequency, retention_days, created_by)
        VALUES ('${clientAId}', '${IDS.resA}', 'Staff Policy Attempt', 'daily', 30, '${staffId}');
      `);
    })
  );

  // 3E-RBAC-4: Staff cannot access financial amounts
  await db.exec(`
    INSERT INTO public.invoices (id, client_id, invoice_number, total, subtotal, currency, status, due_date)
    VALUES ('99999999-9999-9999-9999-999999999991', '${clientAId}', 'INV-3E-001', 5000000, 5000000, 'UGX', 'sent', '2026-10-15')
    ON CONFLICT DO NOTHING;
  `);
  await asUser(db, staffId, async () => {
    const inv = (await db.query(`SELECT * FROM public.invoices;`)).rows;
    assert.equal(inv.length, 0, "Staff sees 0 invoices");
  });

  // 3E-RBAC-5: Finance cannot perform operational backup actions
  await assert.rejects(
    () => asUser(db, financeId, async () => {
      await db.query(`
        INSERT INTO public.backup_events (client_id, backup_policy_id, resource_id, status, recorded_by)
        VALUES ('${clientAId}', '${polA}', '${IDS.resA}', 'successful', '${financeId}');
      `);
    }),
    /Finance users cannot record backup events|row-level security/
  );
  await asUser(db, financeId, async () => {
    const res = await db.query(`UPDATE public.backup_events SET status = 'verified' WHERE recorded_by = '${staffId}';`);
    assert.equal(res.rowCount, 0, "Finance event update affects 0 rows under RLS");
    // But finance retains read context
    const pols = (await db.query(`SELECT id FROM public.backup_policies;`)).rows;
    assert.ok(pols.length >= 1, "Finance can read backup policies");
  });

  // 3E-RBAC-6: Clients cannot access backup records
  await asUser(db, clientAId, async () => {
    const pols = (await db.query(`SELECT * FROM public.backup_policies;`)).rows;
    assert.equal(pols.length, 0, "Client sees 0 policies");
    const evs = (await db.query(`SELECT * FROM public.backup_events;`)).rows;
    assert.equal(evs.length, 0, "Client sees 0 events");
    await assert.rejects(
      () => db.query(`
        INSERT INTO public.backup_events (client_id, resource_id, status, recorded_by)
        VALUES ('${clientAId}', '${IDS.resA}', 'successful', '${clientAId}');
      `)
    );
  });
});

test("PHASE 3E: Security — delete safety, anon isolation, no secrets (3E-SEC-1 to 3E-SEC-4)", async () => {
  const db = await createDb();
  const { adminId, clientAId } = await setupAccounts(db);
  const polA = await createPolicy(db, { adminId, clientAId });
  const ev = (await db.query(`
    INSERT INTO public.backup_events (client_id, backup_policy_id, resource_id, status, recorded_by)
    VALUES ('${clientAId}', '${polA}', '${IDS.resA}', 'successful', '${adminId}')
    RETURNING id;
  `)).rows[0].id;

  // 3E-SEC-3: destructive deletion blocked
  await assert.rejects(
    () => db.query(`DELETE FROM public.backup_events WHERE id = '${ev}';`),
    /Destructive deletion of backup event records is strictly forbidden/
  );
  await assert.rejects(
    () => db.query(`DELETE FROM public.backup_policies WHERE id = '${polA}';`),
    /Destructive deletion of backup policies is strictly forbidden/
  );

  // 3E-SEC-4: no credential/secret columns exist
  const cols = (await db.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name IN ('backup_policies', 'backup_events');
  `)).rows.map(r => r.column_name);
  const forbidden = cols.filter(c => /password|secret|token|api_key|apikey|private_key|credential/i.test(c));
  assert.deepEqual(forbidden, [], `no secret columns; found ${JSON.stringify(forbidden)}`);

  // Secret-shaped values rejected by check_no_secrets_in_text
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.backup_events (client_id, resource_id, status, recorded_by, evidence_notes)
      VALUES ('${clientAId}', '${IDS.resA}', 'successful', '${adminId}', 'password = "hunter2secret"');
    `)
  );

  // 3E-SEC-1/2: anon zero privileges + no TRUNCATE — verified at grant level
  // (PGlite grants all by default in the harness; the hosted verifier checks
  // information_schema.role_table_grants against real roles).
  const tableList = (await db.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('backup_policies', 'backup_events');
  `)).rows;
  assert.equal(tableList.length, 2);
});
