// Phase 3C: Suspension & Service Enforcement Tests
// Validates suspension_cases, suspension_actions, same-client integrity,
// controlled lifecycle, approval safety, audit logging, and RLS policies.
// Uses the PGlite in-memory Postgres harness.

import test from "node:test";
import assert from "node:assert/strict";
import { createDb, asUser } from "./helpers/db.mjs";

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

  // Setup Providers, Accounts, Systems, Resources, Agreements
  await db.exec(`
    INSERT INTO public.providers (id, name, slug) VALUES ('11111111-1111-1111-1111-111111111111', 'Vercel', 'vercel') ON CONFLICT DO NOTHING;
    INSERT INTO public.provider_accounts (id, provider_id, account_name, ownership)
    VALUES ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'SCH Team', 'sch_managed') ON CONFLICT DO NOTHING;

    -- Client A System & Resources
    INSERT INTO public.systems (id, client_id, name, system_type, status)
    VALUES ('33333333-3333-3333-3333-333333333333', '${clientAId}', 'Client A System', 'web_platform', 'live') ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (id, system_id, provider_account_id, name, resource_type, client_id, status)
    VALUES ('44444444-4444-4444-4444-444444444441', '33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'Client A Web App', 'web_app', '${clientAId}', 'active') ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (id, system_id, provider_account_id, name, resource_type, client_id, status)
    VALUES ('44444444-4444-4444-4444-444444444442', '33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'Client A DB', 'database', '${clientAId}', 'active') ON CONFLICT DO NOTHING;

    -- Client B System & Resources
    INSERT INTO public.systems (id, client_id, name, system_type, status)
    VALUES ('55555555-5555-5555-5555-555555555555', '${clientBId}', 'Client B System', 'web_platform', 'live') ON CONFLICT DO NOTHING;

    INSERT INTO public.resources (id, system_id, provider_account_id, name, resource_type, client_id, status)
    VALUES ('66666666-6666-6666-6666-666666666661', '55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', 'Client B App', 'web_app', '${clientBId}', 'active') ON CONFLICT DO NOTHING;

    -- Client A Agreement
    INSERT INTO public.service_agreements (id, client_id, system_id, name, service_type, status, start_date)
    VALUES ('77777777-7777-7777-7777-777777777771', '${clientAId}', '33333333-3333-3333-3333-333333333333', 'Client A SLA', 'managed_service', 'active', '2026-09-01') ON CONFLICT DO NOTHING;

    -- Attach Resource 44444444-4444-4444-4444-444444444441 to Agreement A
    INSERT INTO public.agreement_resources (agreement_id, resource_id)
    VALUES ('77777777-7777-7777-7777-777777777771', '44444444-4444-4444-4444-444444444441') ON CONFLICT DO NOTHING;
  `);

  return { adminId, staffId, staff2Id, financeId, clientAId, clientBId };
}

test("PHASE 3C: Schema creation, table existence and RLS enabled", async () => {
  const db = await createDb();
  await setupAccounts(db);

  const tables = (await db.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name IN ('suspension_cases', 'suspension_actions')
    ORDER BY table_name;
  `)).rows.map(r => r.table_name);

  assert.deepEqual(tables, ["suspension_actions", "suspension_cases"]);

  const rls = (await db.query(`
    SELECT c.relname, c.relrowsecurity 
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN ('suspension_cases', 'suspension_actions')
    ORDER BY c.relname;
  `)).rows;

  assert.equal(rls.length, 2);
  assert.equal(rls[0].relrowsecurity, true);
  assert.equal(rls[1].relrowsecurity, true);
});

test("PHASE 3C: Same-Client Integrity (3C-INT-1, 3C-INT-2, 3C-INT-3)", async () => {
  const db = await createDb();
  const { adminId, clientAId, clientBId } = await setupAccounts(db);

  const agreementA = "77777777-7777-7777-7777-777777777771";
  const systemB = "55555555-5555-5555-5555-555555555555";
  const resB = "66666666-6666-6666-6666-666666666661";
  const resA1 = "44444444-4444-4444-4444-444444444441";
  const resA2 = "44444444-4444-4444-4444-444444444442"; // client A, but not in agreement A

  // 3C-INT-3: Client A system cannot be attached to Client B agreement (or vice versa)
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.service_agreements (client_id, system_id, name, service_type, start_date)
      VALUES ('${clientAId}', '${systemB}', 'Cross System Agreement', 'managed_service', CURRENT_DATE);
    `),
    /Agreement system must belong to the agreement client/
  );

  // 3C-INT-1: Client A agreement cannot reference Client B resource
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.agreement_resources (agreement_id, resource_id)
      VALUES ('${agreementA}', '${resB}');
    `),
    /Resource client ownership must match agreement client/
  );

  // Cross-client system on suspension case
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.suspension_cases (service_agreement_id, client_id, system_id, reason, requested_by)
      VALUES ('${agreementA}', '${clientAId}', '${systemB}', 'Test non-payment', '${adminId}');
    `),
    /Suspension case system must belong to the case client/
  );

  // Create valid suspension case for Client A
  const caseRes = await db.query(`
    INSERT INTO public.suspension_cases (service_agreement_id, client_id, reason, requested_by)
    VALUES ('${agreementA}', '${clientAId}', 'Non-payment notice expired', '${adminId}')
    RETURNING id;
  `);
  const caseId = caseRes.rows[0].id;

  // 3C-INT-2: Client A suspension cannot contain Client B resource
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.suspension_actions (suspension_case_id, resource_id, action_type)
      VALUES ('${caseId}', '${resB}', 'suspension');
    `),
    /Suspension action resource client ownership must match suspension case client/
  );

  // Resource belonging to Client A but not attached to agreement A in agreement_resources
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.suspension_actions (suspension_case_id, resource_id, action_type)
      VALUES ('${caseId}', '${resA2}', 'suspension');
    `),
    /Resource must be covered by the service agreement in agreement_resources/
  );

  // Valid resource covered by agreement succeeds
  await db.query(`
    INSERT INTO public.suspension_actions (suspension_case_id, resource_id, action_type)
    VALUES ('${caseId}', '${resA1}', 'suspension');
  `);
});

test("PHASE 3C: Controlled Lifecycle & Approval Safety (3C-LIFE-1 to 3C-LIFE-7)", async () => {
  const db = await createDb();
  const { adminId, clientAId } = await setupAccounts(db);
  const agreementA = "77777777-7777-7777-7777-777777777771";

  // 3C-LIFE-1: New case cannot directly become suspended without approval
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.suspension_cases (service_agreement_id, client_id, reason, requested_by, status)
      VALUES ('${agreementA}', '${clientAId}', 'Direct suspend attempt', '${adminId}', 'suspended');
    `),
    /New suspension case cannot directly be created in an active or executed status/
  );

  // Create proposed case
  const cRes = await db.query(`
    INSERT INTO public.suspension_cases (service_agreement_id, client_id, reason, requested_by, status)
    VALUES ('${agreementA}', '${clientAId}', 'Delinquent account invoice', '${adminId}', 'proposed')
    RETURNING id;
  `);
  const cId = cRes.rows[0].id;

  // Test Rejected transition & 3C-LIFE-2: Rejected case cannot be executed
  const rCase = (await db.query(`
    INSERT INTO public.suspension_cases (service_agreement_id, client_id, reason, requested_by, status)
    VALUES ('${agreementA}', '${clientAId}', 'Reject test case', '${adminId}', 'pending_approval')
    RETURNING id;
  `)).rows[0].id;

  await asUser(db, adminId, async () => {
    await db.query(`UPDATE public.suspension_cases SET status = 'rejected' WHERE id = '${rCase}';`);
  });

  await assert.rejects(
    () => db.query(`UPDATE public.suspension_cases SET status = 'executing' WHERE id = '${rCase}';`),
    /Rejected suspension case cannot be executed or transitioned/
  );

  // Test Cancelled transition & 3C-LIFE-3: Cancelled case cannot be executed
  const canCase = (await db.query(`
    INSERT INTO public.suspension_cases (service_agreement_id, client_id, reason, requested_by, status)
    VALUES ('${agreementA}', '${clientAId}', 'Cancel test case', '${adminId}', 'proposed')
    RETURNING id;
  `)).rows[0].id;

  await db.query(`UPDATE public.suspension_cases SET status = 'cancelled' WHERE id = '${canCase}';`);

  await assert.rejects(
    () => db.query(`UPDATE public.suspension_cases SET status = 'approved' WHERE id = '${canCase}';`),
    /Cancelled suspension case cannot be executed or transitioned/
  );

  // 3C-LIFE-4: Approved case can transition into execution
  await asUser(db, adminId, async () => {
    await db.query(`UPDATE public.suspension_cases SET status = 'approved' WHERE id = '${cId}';`);
  });

  let cur = (await db.query(`SELECT status, approved_at, approved_by FROM public.suspension_cases WHERE id = '${cId}';`)).rows[0];
  assert.equal(cur.status, "approved");
  assert.ok(cur.approved_at, "approved_at must be populated");
  assert.equal(cur.approved_by, adminId);

  // Transition into executing
  await asUser(db, adminId, async () => {
    await db.query(`UPDATE public.suspension_cases SET status = 'executing' WHERE id = '${cId}';`);
  });
  cur = (await db.query(`SELECT status FROM public.suspension_cases WHERE id = '${cId}';`)).rows[0];
  assert.equal(cur.status, "executing");

  // Transition to suspended
  await asUser(db, adminId, async () => {
    await db.query(`UPDATE public.suspension_cases SET status = 'suspended' WHERE id = '${cId}';`);
  });
  cur = (await db.query(`SELECT status, executed_at FROM public.suspension_cases WHERE id = '${cId}';`)).rows[0];
  assert.equal(cur.status, "suspended");
  assert.ok(cur.executed_at, "executed_at must be set");

  // 3C-LIFE-5: Executed suspension can be verified
  await asUser(db, adminId, async () => {
    await db.query(`UPDATE public.suspension_cases SET verified_at = now() WHERE id = '${cId}';`);
  });
  cur = (await db.query(`SELECT verified_at FROM public.suspension_cases WHERE id = '${cId}';`)).rows[0];
  assert.ok(cur.verified_at, "verified_at must be set");

  // 3C-LIFE-6: Suspended case can enter restoration
  await asUser(db, adminId, async () => {
    await db.query(`UPDATE public.suspension_cases SET status = 'restoration_pending' WHERE id = '${cId}';`);
  });
  cur = (await db.query(`SELECT status FROM public.suspension_cases WHERE id = '${cId}';`)).rows[0];
  assert.equal(cur.status, "restoration_pending");

  // 3C-LIFE-7: Restored case records restoration correctly
  await asUser(db, adminId, async () => {
    await db.query(`UPDATE public.suspension_cases SET status = 'restored' WHERE id = '${cId}';`);
  });
  cur = (await db.query(`SELECT status, restored_at FROM public.suspension_cases WHERE id = '${cId}';`)).rows[0];
  assert.equal(cur.status, "restored");
  assert.ok(cur.restored_at, "restored_at must be set");
});

test("PHASE 3C: Role Permissions & Separation (3C-RBAC-1 to 3C-RBAC-6)", async () => {
  const db = await createDb();
  const { adminId, staffId, staff2Id, financeId, clientAId } = await setupAccounts(db);
  const agreementA = "77777777-7777-7777-7777-777777777771";
  const resA1 = "44444444-4444-4444-4444-444444444441";

  // 3C-RBAC-1: Admin can create and manage suspension cases
  let cId;
  await asUser(db, adminId, async () => {
    const res = await db.query(`
      INSERT INTO public.suspension_cases (service_agreement_id, client_id, reason, requested_by, status, assigned_to)
      VALUES ('${agreementA}', '${clientAId}', 'Admin initiated case', '${adminId}', 'proposed', '${staffId}')
      RETURNING id;
    `);
    cId = res.rows[0].id;
  });
  assert.ok(cId);

  // 3C-RBAC-2: Finance cannot approve or execute suspension
  await asUser(db, financeId, async () => {
    await assert.rejects(
      () => db.query(`UPDATE public.suspension_cases SET status = 'approved' WHERE id = '${cId}';`),
      /Only administrators can approve suspension cases|permission denied/
    );
  });

  // 3C-RBAC-3: Staff cannot approve suspension
  await asUser(db, staffId, async () => {
    await assert.rejects(
      () => db.query(`UPDATE public.suspension_cases SET status = 'approved' WHERE id = '${cId}';`),
      /Only administrators can approve suspension cases/
    );
  });

  // Admin approves case and adds an action assigned to staffId
  let actId;
  await asUser(db, adminId, async () => {
    await db.query(`UPDATE public.suspension_cases SET status = 'approved' WHERE id = '${cId}';`);
    const actRes = await db.query(`
      INSERT INTO public.suspension_actions (suspension_case_id, resource_id, action_type, assigned_to)
      VALUES ('${cId}', '${resA1}', 'suspension', '${staffId}')
      RETURNING id;
    `);
    actId = actRes.rows[0].id;
  });

  // 3C-RBAC-5: Unassigned Staff cannot execute another user's restricted action
  await asUser(db, staff2Id, async () => {
    await assert.rejects(
      () => db.query(`
        UPDATE public.suspension_actions 
        SET action_status = 'completed', evidence_reference = 'Suspended via dashboard' 
        WHERE id = '${actId}';
      `),
      /Unassigned staff cannot execute this restricted action/
    );
  });

  // 3C-RBAC-4: Assigned Staff can execute an approved action
  await asUser(db, staffId, async () => {
    await db.query(`
      UPDATE public.suspension_actions 
      SET action_status = 'completed', evidence_reference = 'Suspended via CLI' 
      WHERE id = '${actId}';
    `);
  });

  const actRec = (await db.query(`SELECT action_status, performed_by, performed_at, evidence_reference FROM public.suspension_actions WHERE id = '${actId}';`)).rows[0];
  assert.equal(actRec.action_status, "completed");
  assert.equal(actRec.performed_by, staffId);
  assert.ok(actRec.performed_at);
  assert.equal(actRec.evidence_reference, "Suspended via CLI");

  // Staff cannot verify action
  await asUser(db, staffId, async () => {
    await assert.rejects(
      () => db.query(`UPDATE public.suspension_actions SET action_status = 'verified' WHERE id = '${actId}';`),
      /Only administrators can verify suspension actions/
    );
  });

  // Admin can verify action
  await asUser(db, adminId, async () => {
    await db.query(`UPDATE public.suspension_actions SET action_status = 'verified' WHERE id = '${actId}';`);
  });
  const actVerified = (await db.query(`SELECT action_status, verified_by, verified_at FROM public.suspension_actions WHERE id = '${actId}';`)).rows[0];
  assert.equal(actVerified.action_status, "verified");
  assert.equal(actVerified.verified_by, adminId);
  assert.ok(actVerified.verified_at);

  // 3C-RBAC-6: Clients cannot access suspension records
  await asUser(db, clientAId, async () => {
    const cases = (await db.query(`SELECT * FROM public.suspension_cases;`)).rows;
    assert.equal(cases.length, 0, "Clients must see 0 suspension cases");

    const actions = (await db.query(`SELECT * FROM public.suspension_actions;`)).rows;
    assert.equal(actions.length, 0, "Clients must see 0 suspension actions");

    await assert.rejects(
      () => db.query(`INSERT INTO public.suspension_cases (service_agreement_id, client_id, reason, requested_by) VALUES ('${agreementA}', '${clientAId}', 'Client forged case', '${clientAId}');`),
      /violates row-level security policy/
    );
  });
});

test("PHASE 3C: Audit Logging & Safety (3C-AUDIT-1, 3C-SEC-1 to 3C-SEC-5)", async () => {
  const db = await createDb();
  const { adminId, staffId, clientAId } = await setupAccounts(db);
  const agreementA = "77777777-7777-7777-7777-777777777771";
  const resA1 = "44444444-4444-4444-4444-444444444441";

  // Create case
  const cRes = await db.query(`
    INSERT INTO public.suspension_cases (service_agreement_id, client_id, reason, requested_by, status)
    VALUES ('${agreementA}', '${clientAId}', 'Audit test case', '${adminId}', 'proposed')
    RETURNING id;
  `);
  const cId = cRes.rows[0].id;

  // Approve case
  await asUser(db, adminId, async () => {
    await db.query(`UPDATE public.suspension_cases SET status = 'approved' WHERE id = '${cId}';`);
    await db.query(`UPDATE public.suspension_cases SET assigned_to = '${staffId}' WHERE id = '${cId}';`);
  });

  // Verify 3C-AUDIT-1: Audit records created
  const caseAudits = (await db.query(`
    SELECT action, table_name, record_id 
    FROM public.audit_logs 
    WHERE table_name = 'suspension_cases' AND record_id = '${cId}'
    ORDER BY created_at;
  `)).rows;

  const actions = caseAudits.map(a => a.action);
  assert.ok(actions.includes("suspension_case.created"), "Must log creation");
  assert.ok(actions.includes("suspension_case.approved"), "Must log approval");
  assert.ok(actions.includes("suspension_case.assignment_changed"), "Must log assignment change");

  // Destructive delete blocked for authenticated users (0 rows deleted due to USING false)
  await asUser(db, adminId, async () => {
    const delRes = await db.query(`DELETE FROM public.suspension_cases WHERE id = '${cId}';`);
    assert.equal(delRes.rowCount, 0, "No rows can be deleted by authenticated users");
  });

  // And database trigger blocks destructive delete even for superuser / service_role
  await assert.rejects(
    () => db.query(`DELETE FROM public.suspension_cases WHERE id = '${cId}';`),
    /Destructive deletion of suspension records is strictly forbidden/
  );

  // 3C-SEC-4 & 3C-SEC-5: Staff cannot see recurring charges financial data
  await asUser(db, staffId, async () => {
    const charges = (await db.query(`SELECT * FROM public.recurring_charges;`)).rows;
    assert.equal(charges.length, 0, "Staff must see 0 recurring charges");
  });
});
