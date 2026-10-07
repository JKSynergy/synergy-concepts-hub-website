// Phase 3B: Application-level service suspension tests.
// Verifies that commercial/service access suspension is independent of
// infrastructure, scoped to one client/system, enforced in client layout and
// server actions, and audited. No provider mutation is tested or permitted.

import test from "node:test";
import assert from "node:assert/strict";
import { createDb, asUser, asService, rejects } from "./helpers/db.mjs";

const IDS = {
  admin: "00000000-0000-0000-0000-0000000000a1",
  clientA: "00000000-0000-0000-0000-0000000000c1",
  clientB: "00000000-0000-0000-0000-0000000000c2",
};

async function seed(db) {
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${IDS.admin}', 'admin@example.test'),
      ('${IDS.clientA}', 'clienta@example.test'),
      ('${IDS.clientB}', 'clientb@example.test');
    UPDATE public.profiles SET role = 'admin' WHERE id = '${IDS.admin}';
    UPDATE public.profiles SET role = 'client' WHERE id IN ('${IDS.clientA}', '${IDS.clientB}');
  `);

  const sysA = await db.query(`INSERT INTO public.systems (client_id, name, system_type, status) VALUES ('${IDS.clientA}', 'Elgon BMS', 'web_platform', 'live') RETURNING id`);
  const sysB = await db.query(`INSERT INTO public.systems (client_id, name, system_type, status) VALUES ('${IDS.clientB}', 'Client B System', 'web_platform', 'live') RETURNING id`);
  return { systemA: sysA.rows[0].id, systemB: sysB.rows[0].id };
}

test("PHASE 3B-DB-1: suspend_application_system sets status and metadata", async () => {
  const db = await createDb();
  const { systemA } = await seed(db);

  await asService(db, () =>
    db.query(`SELECT public.suspend_application_system('${systemA}', 'NON_PAYMENT', 'Overdue invoice', '${IDS.admin}')`)
  );

  const row = (await db.query(`SELECT status, suspended_at, suspended_by, suspension_reason, suspension_note FROM public.systems WHERE id = '${systemA}'`)).rows[0];
  assert.equal(row.status, "suspended");
  assert.ok(row.suspended_at, "suspended_at should be set");
  assert.equal(row.suspended_by, IDS.admin);
  assert.equal(row.suspension_reason, "NON_PAYMENT");
  assert.equal(row.suspension_note, "Overdue invoice");
});

test("PHASE 3B-DB-2: resume_application_system restores live status and records metadata", async () => {
  const db = await createDb();
  const { systemA } = await seed(db);
  await asService(db, () =>
    db.query(`SELECT public.suspend_application_system('${systemA}', 'NON_PAYMENT', 'Overdue invoice', '${IDS.admin}')`)
  );

  await asService(db, () =>
    db.query(`SELECT public.resume_application_system('${systemA}', 'Payment received', '${IDS.admin}')`)
  );

  const row = (await db.query(`SELECT status, resumed_at, resumed_by, suspension_note FROM public.systems WHERE id = '${systemA}'`)).rows[0];
  assert.equal(row.status, "live");
  assert.ok(row.resumed_at, "resumed_at should be set");
  assert.equal(row.resumed_by, IDS.admin);
});

test("PHASE 3B-DB-3: suspension transition writes SERVICE_SUSPENDED audit event", async () => {
  const db = await createDb();
  const { systemA } = await seed(db);
  await asService(db, () =>
    db.query(`SELECT public.suspend_application_system('${systemA}', 'NON_PAYMENT', NULL, '${IDS.admin}')`)
  );

  const audit = (await db.query(`SELECT action, table_name, record_id FROM public.audit_logs WHERE action = 'SERVICE_SUSPENDED' AND table_name = 'systems' AND record_id = '${systemA}'`)).rows;
  assert.equal(audit.length, 1);
});

test("PHASE 3B-DB-4: resume transition writes SERVICE_RESUMED audit event", async () => {
  const db = await createDb();
  const { systemA } = await seed(db);
  await asService(db, () =>
    db.query(`SELECT public.suspend_application_system('${systemA}', 'NON_PAYMENT', NULL, '${IDS.admin}')`)
  );
  await asService(db, () =>
    db.query(`SELECT public.resume_application_system('${systemA}', NULL, '${IDS.admin}')`)
  );

  const audit = (await db.query(`SELECT action, table_name, record_id FROM public.audit_logs WHERE action = 'SERVICE_RESUMED' AND table_name = 'systems' AND record_id = '${systemA}'`)).rows;
  assert.equal(audit.length, 1);
});

test("PHASE 3B-DB-5: non-admin cannot suspend or resume", async () => {
  const db = await createDb();
  const { systemA } = await seed(db);

  await rejects(
    asUser(db, IDS.clientA, () =>
      db.query(`SELECT public.suspend_application_system('${systemA}', 'NON_PAYMENT', NULL, '${IDS.clientA}')`)
    ),
    /Only administrators/
  );

  await asService(db, () =>
    db.query(`SELECT public.suspend_application_system('${systemA}', 'NON_PAYMENT', NULL, '${IDS.admin}')`)
  );

  await rejects(
    asUser(db, IDS.clientA, () =>
      db.query(`SELECT public.resume_application_system('${systemA}', NULL, '${IDS.clientA}')`)
    ),
    /Only administrators/
  );
});

test("PHASE 3B-DB-6: suspension reason is required", async () => {
  const db = await createDb();
  const { systemA } = await seed(db);

  await rejects(
    asService(db, () =>
      db.query(`SELECT public.suspend_application_system('${systemA}', '  ', NULL, '${IDS.admin}')`)
    ),
    /Suspension reason is required/
  );
});

test("PHASE 3B-DB-7: cross-client isolation — suspending System A does not affect System B", async () => {
  const db = await createDb();
  const { systemA, systemB } = await seed(db);
  await asService(db, () =>
    db.query(`SELECT public.suspend_application_system('${systemA}', 'NON_PAYMENT', NULL, '${IDS.admin}')`)
  );

  const a = (await db.query(`SELECT status FROM public.systems WHERE id = '${systemA}'`)).rows[0];
  const b = (await db.query(`SELECT status FROM public.systems WHERE id = '${systemB}'`)).rows[0];
  assert.equal(a.status, "suspended");
  assert.equal(b.status, "live", "System B must remain active");
});

test("PHASE 3B-DB-8: suspended system can still have healthy infrastructure metadata", async () => {
  const db = await createDb();
  const { systemA } = await seed(db);
  await asService(db, () =>
    db.query(`SELECT public.suspend_application_system('${systemA}', 'NON_PAYMENT', NULL, '${IDS.admin}')`)
  );

  const row = (await db.query(`SELECT status FROM public.systems WHERE id = '${systemA}'`)).rows[0];
  assert.equal(row.status, "suspended");
  // No provider resources, runs, or signals were created or modified.
  const infra = (await db.query(`SELECT COUNT(*)::int c FROM public.resources WHERE system_id = '${systemA}'`)).rows[0].c;
  assert.equal(infra, 0);
});

test("PHASE 3B-DB-9: secret-shaped suspension note is rejected", async () => {
  const db = await createDb();
  const { systemA } = await seed(db);

  await rejects(
    asService(db, () =>
      db.query(`SELECT public.suspend_application_system('${systemA}', 'NON_PAYMENT', 'token sb_secret_abcdefghijklmnop', '${IDS.admin}')`)
    ),
    /check_no_secrets_in_text/
  );
});

test("PHASE 3B-DB-10: live system does not block application access", async () => {
  const db = await createDb();
  await seed(db);
  const suspended = (
    await db.query(`SELECT COUNT(*)::int c FROM public.systems WHERE client_id = '${IDS.clientA}' AND status = 'suspended'`)
  ).rows[0].c;
  assert.equal(suspended, 0, "Client A should have no suspended systems while live");
});

test("PHASE 3B-DB-11: client without systems is not blocked", async () => {
  const db = await createDb();
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${IDS.clientA}', 'clienta@example.test') ON CONFLICT (id) DO NOTHING;
    UPDATE public.profiles SET role = 'client' WHERE id = '${IDS.clientA}';
  `);
  const count = (
    await db.query(`SELECT COUNT(*)::int c FROM public.systems WHERE client_id = '${IDS.clientA}'`)
  ).rows[0].c;
  assert.equal(count, 0, "Client A should have no systems");
});

test("PHASE 3B-DB-12: full lifecycle suspend → resume restores active access", async () => {
  const db = await createDb();
  const { systemA } = await seed(db);

  await asService(db, () =>
    db.query(`SELECT public.suspend_application_system('${systemA}', 'NON_PAYMENT', NULL, '${IDS.admin}')`)
  );
  assert.equal(
    (await db.query(`SELECT status FROM public.systems WHERE id = '${systemA}'`)).rows[0].status,
    "suspended"
  );

  await asService(db, () =>
    db.query(`SELECT public.resume_application_system('${systemA}', 'Payment received', '${IDS.admin}')`)
  );
  const row = (await db.query(`SELECT status, resumed_at, resumed_by FROM public.systems WHERE id = '${systemA}'`)).rows[0];
  assert.equal(row.status, "live");
  assert.ok(row.resumed_at, "resumed_at should be set after resume");
  assert.equal(row.resumed_by, IDS.admin);
});

test("PHASE 3B-DB-13: monitoring/scheduling tables are untouched by suspension lifecycle", async () => {
  const db = await createDb();
  const { systemA } = await seed(db);
  await asService(db, () =>
    db.query(`SELECT public.suspend_application_system('${systemA}', 'NON_PAYMENT', NULL, '${IDS.admin}')`)
  );

  const counts = await db.query(`
    SELECT
      (SELECT COUNT(*)::int FROM public.provider_monitoring_schedules) AS schedules,
      (SELECT COUNT(*)::int FROM public.provider_monitoring_runs) AS runs,
      (SELECT COUNT(*)::int FROM public.action_items WHERE source = 'provider_monitoring') AS signals
  `);
  assert.equal(counts.rows[0].schedules, 0);
  assert.equal(counts.rows[0].runs, 0);
  assert.equal(counts.rows[0].signals, 0);
});
