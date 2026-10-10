// Phase 4: Atomic suspension case -> agreement transitions (migration 032).
// Covers transition_suspension_case: paired writes in one transaction,
// role/assignment enforcement, actor-mismatch rejection, idempotent retry,
// and single-audit-event semantics. PGlite harness.
//
// Harness note: asUser() sets SET ROLE authenticated + request.jwt.claim.sub,
// so auth.uid(), is_admin()/is_staff(), RLS and trigger checks behave like a
// real PostgREST authenticated call — including inside SECURITY DEFINER.

import test from "node:test";
import assert from "node:assert/strict";
import { createDb, asUser, rejects } from "./helpers/db.mjs";

const ADMIN = "00000000-0000-0000-0000-0000000000a1";
const STAFF = "00000000-0000-0000-0000-0000000000b1";
const STAFF2 = "00000000-0000-0000-0000-0000000000b2";
const FINANCE = "00000000-0000-0000-0000-0000000000f1";
const CLIENT = "00000000-0000-0000-0000-0000000000c1";
const SYS = "33333333-3333-3333-3333-333333333333";
const AGREEMENT = "77777777-7777-7777-7777-777777777771";
const CASE_ID = "88888888-8888-8888-8888-888888888881";

async function setup(db, { caseStatus = "approved", assignedTo = STAFF } = {}) {
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${ADMIN}', 'admin@example.test'), ('${STAFF}', 'staff@example.test'),
      ('${STAFF2}', 'staff2@example.test'), ('${FINANCE}', 'finance@example.test'),
      ('${CLIENT}', 'client@example.test')
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.profiles (id, email, role) VALUES
      ('${ADMIN}', 'admin@example.test', 'admin'), ('${STAFF}', 'staff@example.test', 'staff'),
      ('${STAFF2}', 'staff2@example.test', 'staff'), ('${FINANCE}', 'finance@example.test', 'finance'),
      ('${CLIENT}', 'client@example.test', 'client')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
    INSERT INTO public.systems (id, client_id, name, system_type, status)
      VALUES ('${SYS}', '${CLIENT}', 'Test System', 'web_platform', 'live') ON CONFLICT DO NOTHING;
    INSERT INTO public.service_agreements (id, client_id, system_id, name, service_type, status, start_date)
      VALUES ('${AGREEMENT}', '${CLIENT}', '${SYS}', 'SLA', 'managed_service', 'active', '2026-09-01')
      ON CONFLICT DO NOTHING;
    INSERT INTO public.suspension_cases (id, service_agreement_id, client_id, system_id, reason, status, requested_by, assigned_to)
      VALUES ('${CASE_ID}', '${AGREEMENT}', '${CLIENT}', '${SYS}', 'non-payment review', 'proposed', '${ADMIN}', ${assignedTo ? `'${assignedTo}'` : "NULL"})
      ON CONFLICT (id) DO NOTHING;
  `);
  // Walk the case to the requested status via legal transitions (the lifecycle
  // trigger forbids inserting directly into approved/executed states; as
  // superuser auth.uid() is null so role checks are skipped for seeding).
  if (["approved", "suspended", "restoration_pending"].includes(caseStatus)) {
    await db.query(`UPDATE public.suspension_cases SET status = 'approved' WHERE id = '${CASE_ID}'`);
  }
  if (["suspended", "restoration_pending"].includes(caseStatus)) {
    await db.query(`UPDATE public.suspension_cases SET status = 'suspended' WHERE id = '${CASE_ID}'`);
  }
}

const callRpc = (db, userId, action, actor = userId, notes = null, caseId = CASE_ID) =>
  asUser(db, userId, () =>
    db.query(`SELECT public.transition_suspension_case('${caseId}', '${action}', ${actor ? `'${actor}'` : "NULL"}, ${notes ? `'${notes}'` : "NULL"}) AS st`));

const state = async (db) => (await db.query(`
  SELECT sc.status AS case_status, sa.status AS agreement_status
  FROM public.suspension_cases sc JOIN public.service_agreements sa ON sa.id = sc.service_agreement_id
  WHERE sc.id = '${CASE_ID}'`)).rows[0];

const auditCount = async (db, action, recordId) => (await db.query(`
  SELECT count(*)::int AS n FROM public.audit_logs WHERE action = '${action}' AND record_id = '${recordId}'`)).rows[0].n;

test("P4-SUSP-1 assigned staff execute: case AND agreement both suspended atomically", async () => {
  const db = await createDb();
  await setup(db);

  const res = await callRpc(db, STAFF, "execute");
  assert.equal(res.rows[0].st, "suspended");

  const s = await state(db);
  assert.equal(s.case_status, "suspended");
  assert.equal(s.agreement_status, "suspended");

  // One case audit event + one agreement audit event, attributed to staff.
  assert.equal(await auditCount(db, "suspension_case.executed", CASE_ID), 1);
  const { rows } = await db.query(
    `SELECT actor_id, actor_role, details->>'transition' AS tr FROM public.audit_logs
     WHERE action = 'service_agreement.status_changed' AND record_id = '${AGREEMENT}'`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actor_id, STAFF);
  assert.equal(rows[0].actor_role, "staff");
  assert.equal(rows[0].tr, "execute");
});

test("P4-SUSP-2 assigned staff completes restoration: case restored AND agreement active", async () => {
  const db = await createDb();
  await setup(db, { caseStatus: "suspended" });
  await db.query(`UPDATE public.service_agreements SET status = 'suspended' WHERE id = '${AGREEMENT}'`);

  const res = await callRpc(db, STAFF, "complete_restoration");
  assert.equal(res.rows[0].st, "restored");

  const s = await state(db);
  assert.equal(s.case_status, "restored");
  assert.equal(s.agreement_status, "active");
  assert.equal(await auditCount(db, "suspension_case.restored", CASE_ID), 1);
});

test("P4-SUSP-3 rollback: agreement write failure rolls back the case transition", async () => {
  const db = await createDb();
  await setup(db);

  // Test-only blocker: any UPDATE on service_agreements fails.
  await db.exec(`
    CREATE OR REPLACE FUNCTION public.test_block_agreement_update() RETURNS TRIGGER
    LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test-forced agreement failure'; END; $$;
    CREATE TRIGGER trg_test_block_agreement BEFORE UPDATE ON public.service_agreements
    FOR EACH ROW EXECUTE FUNCTION public.test_block_agreement_update();
  `);

  const err = await rejects(callRpc(db, STAFF, "execute"), "execute with blocked agreement");
  assert.match(err.message, /test-forced agreement failure/);

  // Both writes must be absent — the case never left 'approved'.
  const s = await state(db);
  assert.equal(s.case_status, "approved");
  assert.equal(s.agreement_status, "active");
  assert.equal(await auditCount(db, "suspension_case.executed", CASE_ID), 0);
});

test("P4-SUSP-4 finance and client callers are rejected", async () => {
  const db = await createDb();
  await setup(db);

  const e1 = await rejects(callRpc(db, FINANCE, "execute"), "finance execute");
  assert.match(e1.message, /operational staff|Permission denied/);
  const e2 = await rejects(callRpc(db, CLIENT, "execute"), "client execute");
  assert.match(e2.message, /operational staff|Permission denied/);

  const s = await state(db);
  assert.equal(s.case_status, "approved");
  assert.equal(s.agreement_status, "active");
});

test("P4-SUSP-5 unassigned staff cannot execute another member's assigned case", async () => {
  const db = await createDb();
  await setup(db, { assignedTo: STAFF });

  const err = await rejects(callRpc(db, STAFF2, "execute"), "unassigned staff execute");
  assert.match(err.message, /assigned staff/);
  assert.equal((await state(db)).case_status, "approved");
});

test("P4-SUSP-6 mismatched p_actor is rejected — actor is never trusted", async () => {
  const db = await createDb();
  await setup(db);

  // Staff caller passes the admin's id as p_actor.
  const err = await rejects(callRpc(db, STAFF, "execute", ADMIN), "actor mismatch");
  assert.match(err.message, /Actor mismatch/);
  assert.equal((await state(db)).case_status, "approved");
});

test("P4-SUSP-7 missing case and unsupported action fail safely", async () => {
  const db = await createDb();
  await setup(db);

  const e1 = await rejects(callRpc(db, ADMIN, "execute", ADMIN, null, "99999999-9999-9999-9999-999999999999"), "missing case");
  assert.match(e1.message, /not found/);
  const e2 = await rejects(callRpc(db, ADMIN, "approve", ADMIN), "unsupported action");
  assert.match(e2.message, /Unsupported suspension transition/);
});

test("P4-SUSP-8 duplicate submission is an idempotent no-op — no double transition or audit", async () => {
  const db = await createDb();
  await setup(db);

  assert.equal((await callRpc(db, ADMIN, "execute")).rows[0].st, "suspended");
  // Retry (e.g. timeout then re-submit): returns current status, no write.
  assert.equal((await callRpc(db, ADMIN, "execute")).rows[0].st, "suspended");

  assert.equal(await auditCount(db, "suspension_case.executed", CASE_ID), 1);
  assert.equal(await auditCount(db, "service_agreement.status_changed", AGREEMENT), 1);
});

test("P4-SUSP-9 stale source state raises without writing", async () => {
  const db = await createDb();
  await setup(db, { caseStatus: "proposed" }); // not yet approved

  const err = await rejects(callRpc(db, ADMIN, "execute"), "execute on proposed case");
  assert.match(err.message, /not available for the case/);
  assert.equal((await state(db)).case_status, "proposed");
  assert.equal(await auditCount(db, "suspension_case.executed", CASE_ID), 0);
});
