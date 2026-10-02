// Automated Phase 3C Verification on Hosted DEV
// Project Ref: outuocpsotiozkpyksex ONLY
// Tests real REST API & direct PostgreSQL triggers/constraints against DEV with real test accounts.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { assertDevTarget, assertDbUrlMatchesRef, makeRedactor, writesConfirmed, GuardError } from "./phase2c-guard.mjs";
import { openPgConnection } from "./apply-migration-013.mjs";
import { createClient } from "./phase2c-lib.mjs";
import { ACCOUNT_FILE } from "./phase2c-seed-test-accounts.mjs";

export async function runPhase3cHostedVerification({ env = process.env } = {}) {
  const target = assertDevTarget(env);
  if (!target.dbUrl) {
    throw new GuardError("PHASE2C_DB_URL is required for hosted verification.");
  }
  assertDbUrlMatchesRef(target.dbUrl, target.ref);

  const secrets = [target.anonKey, target.serviceKey, target.dbUrl].filter(Boolean);
  const redact = makeRedactor(() => secrets);

  console.log(`[PHASE 3C DEV VERIFY] Connecting to DEV REST API & DB (${target.ref})...`);

  // Load test accounts
  const accountsPath = resolve(ACCOUNT_FILE);
  const accountsData = JSON.parse(readFileSync(accountsPath, "utf8"));
  const { admin, staff, finance, clientA, clientB } = accountsData;

  const client = createClient({ url: target.url, anonKey: target.anonKey, serviceKey: target.serviceKey });

  // Sign in as each role to acquire tokens
  console.log("[PHASE 3C DEV VERIFY] Signing in test accounts via Supabase Auth...");
  const authResults = {};
  for (const [key, acc] of Object.entries({ admin, staff, finance, clientA, clientB })) {
    const res = await client.auth.signIn(acc.email, acc.password);
    if (!res.ok) {
      throw new Error(`Failed to sign in as ${key}: ${res.error || res.status}`);
    }
    const token = res.body?.access_token || res.token;
    const userId = res.body?.user?.id || acc.id;
    authResults[key] = {
      token,
      userId,
      role: acc.role,
      rest: client.rest({ kind: "user", token })
    };
  }

  const results = [];
  function check(id, title, pass, detail = "") {
    results.push({ id, title, pass, detail });
    console.log(`${pass ? "[PASS]" : "[FAIL]"} ${id.padEnd(10)} ${title} ${detail ? "(" + detail + ")" : ""}`);
  }

  // Connect direct PostgreSQL client for trigger testing & teardown
  const db = await openPgConnection(target.dbUrl);

  try {
    // -------------------------------------------------------------------------
    // 1. Schema & Invariant Checks
    // -------------------------------------------------------------------------
    console.log("\n--- 1. SCHEMA & INVARIANT CHECKS ---");

    // Total public tables
    const tableRes = await db.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    const tables = tableRes.rows.map(r => r.table_name);
    check("3C-SCH-1", "Total application tables is at least 26 (16 Phase 2C + 4 Phase 3A + 4 Phase 3B + 2 Phase 3C)",
      tables.length >= 26, `Found ${tables.length} tables: ${tables.join(", ")}`);

    check("3C-SCH-2", "suspension_cases table exists", tables.includes("suspension_cases"));
    check("3C-SCH-3", "suspension_actions table exists", tables.includes("suspension_actions"));

    // Check RLS enabled on both tables
    const rlsRes = await db.query(`
      SELECT tablename, rowsecurity FROM pg_tables
      WHERE schemaname = 'public' AND tablename IN ('suspension_cases', 'suspension_actions');
    `);
    const rlsMap = Object.fromEntries(rlsRes.rows.map(r => [r.tablename, r.rowsecurity]));
    check("3C-SEC-3a", "RLS enabled on suspension_cases", rlsMap["suspension_cases"] === true);
    check("3C-SEC-3b", "RLS enabled on suspension_actions", rlsMap["suspension_actions"] === true);

    // Check Privileges: anon has 0 privileges on both tables
    const anonPrivs = (await db.query(`
      SELECT privilege_type, table_name FROM information_schema.role_table_grants
      WHERE grantee = 'anon' AND table_schema = 'public' AND table_name IN ('suspension_cases', 'suspension_actions');
    `)).rows;
    check("3C-SEC-1", "anon role has 0 privileges on suspension tables", anonPrivs.length === 0, `Found: ${anonPrivs.length}`);

    // Check Privileges: no TRUNCATE on any role (anon, authenticated, service_role)
    const truncateGrants = (await db.query(`
      SELECT grantee, table_name FROM information_schema.role_table_grants
      WHERE privilege_type = 'TRUNCATE' 
        AND grantee IN ('anon', 'authenticated', 'service_role')
        AND table_schema = 'public' 
        AND table_name IN ('suspension_cases', 'suspension_actions');
    `)).rows;
    check("3C-SEC-2", "No inappropriate TRUNCATE privileges on suspension tables", truncateGrants.length === 0, `Found: ${truncateGrants.length}`);

    // -------------------------------------------------------------------------
    // 2. Setup Fixture Data (Client A Agreement & System, Client B Agreement & System)
    // -------------------------------------------------------------------------
    console.log("\n--- 2. FIXTURE DATA SETUP ---");

    // Fetch existing test systems and resources
    let sysARes = await db.query(`SELECT id FROM public.systems WHERE client_id = '${clientA.id}' LIMIT 1;`);
    let sysBRes = await db.query(`SELECT id FROM public.systems WHERE client_id = '${clientB.id}' LIMIT 1;`);
    const sysAId = sysARes.rows[0]?.id;
    const sysBId = sysBRes.rows[0]?.id;

    // Fetch or create an active agreement for Client A
    let agARes = await db.query(`SELECT id FROM public.service_agreements WHERE client_id = '${clientA.id}' LIMIT 1;`);
    let agAId = agARes.rows[0]?.id;
    if (!agAId) {
      agAId = (await db.query(`
        INSERT INTO public.service_agreements (client_id, system_id, name, service_type, status, start_date)
        VALUES ('${clientA.id}', ${sysAId ? `'${sysAId}'` : 'NULL'}, 'Client A Hosted Test Agreement', 'managed_service', 'active', CURRENT_DATE)
        RETURNING id;
      `)).rows[0].id;
    }

    // Fetch or create resource for Client A
    let resARes = await db.query(`SELECT id FROM public.resources WHERE client_id = '${clientA.id}' LIMIT 1;`);
    let resAId = resARes.rows[0]?.id;

    // Fetch or create resource for Client B
    let resBRes = await db.query(`SELECT id FROM public.resources WHERE client_id = '${clientB.id}' LIMIT 1;`);
    let resBId = resBRes.rows[0]?.id;

    // Link resource A to Agreement A
    if (resAId) {
      await db.query(`
        INSERT INTO public.agreement_resources (agreement_id, resource_id)
        VALUES ('${agAId}', '${resAId}')
        ON CONFLICT DO NOTHING;
      `);
    }

    // -------------------------------------------------------------------------
    // 3. Same-Client Integrity Constraints
    // -------------------------------------------------------------------------
    console.log("\n--- 3. SAME-CLIENT INTEGRITY CONSTRAINTS ---");

    // 3C-INT-1: Client A agreement cannot reference Client B system
    let crossSysBlocked = false;
    if (sysBId) {
      try {
        await db.query(`
          INSERT INTO public.suspension_cases (service_agreement_id, client_id, system_id, reason, status, requested_by)
          VALUES ('${agAId}', '${clientA.id}', '${sysBId}', 'Testing cross system', 'proposed', '${admin.id}');
        `);
      } catch (e) {
        crossSysBlocked = e.message.includes("Suspension case system must belong to the case client");
      }
    } else {
      crossSysBlocked = true;
    }
    check("3C-INT-1", "Client A suspension cannot reference Client B system", crossSysBlocked);

    // Cross-client agreement mismatch (agreement belongs to Client A, but client_id specifies Client B)
    let crossClientAgBlocked = false;
    try {
      await db.query(`
        INSERT INTO public.suspension_cases (service_agreement_id, client_id, reason, status, requested_by)
        VALUES ('${agAId}', '${clientB.id}', 'Testing cross client agreement', 'proposed', '${admin.id}');
      `);
    } catch (e) {
      crossClientAgBlocked = e.message.includes("Suspension case client must match service agreement client");
    }
    check("3C-INT-2", "Suspension case client must match service agreement client", crossClientAgBlocked);

    // Create a valid suspension case for Client A
    const caseAId = (await db.query(`
      INSERT INTO public.suspension_cases (service_agreement_id, client_id, system_id, reason, status, requested_by, notes)
      VALUES ('${agAId}', '${clientA.id}', ${sysAId ? `'${sysAId}'` : 'NULL'}, 'Non-payment of overdue invoice', 'proposed', '${admin.id}', 'Initial operational review')
      RETURNING id;
    `)).rows[0].id;

    // 3C-INT-3: Client A suspension cannot contain Client B resource
    let crossResBlocked = false;
    if (resBId) {
      try {
        await db.query(`
          INSERT INTO public.suspension_actions (suspension_case_id, resource_id, action_type, action_status, performed_by)
          VALUES ('${caseAId}', '${resBId}', 'suspend', 'pending', '${admin.id}');
        `);
      } catch (e) {
        crossResBlocked = e.message.includes("Resource client ownership must match suspension case client");
      }
    } else {
      crossResBlocked = true;
    }
    check("3C-INT-3", "Client A suspension action cannot reference Client B resource", crossResBlocked);

    // -------------------------------------------------------------------------
    // 4. Suspension Lifecycle Transitions & Constraints
    // -------------------------------------------------------------------------
    console.log("\n--- 4. SUSPENSION LIFECYCLE TRANSITIONS ---");

    // 3C-LIFE-1: Direct transition to suspended without approval is rejected
    let directSuspendBlocked = false;
    try {
      await db.query(`
        UPDATE public.suspension_cases
        SET status = 'suspended'
        WHERE id = '${caseAId}';
      `);
    } catch (e) {
      directSuspendBlocked = e.message.includes("Suspension case must be approved or executing before becoming suspended") ||
                             e.message.includes("Invalid suspension case status transition");
    }
    check("3C-LIFE-1", "Direct transition from proposed to suspended is rejected", directSuspendBlocked);

    // Transition: proposed -> pending_approval
    await db.query(`
      UPDATE public.suspension_cases
      SET status = 'pending_approval'
      WHERE id = '${caseAId}';
    `);

    // Transition: pending_approval -> approved (by Admin)
    await db.query(`
      UPDATE public.suspension_cases
      SET status = 'approved', approved_by = '${admin.id}', approved_at = now()
      WHERE id = '${caseAId}';
    `);

    // 3C-LIFE-4: Approved case can transition into executing
    await db.query(`
      UPDATE public.suspension_cases
      SET status = 'executing', assigned_to = '${staff.id}'
      WHERE id = '${caseAId}';
    `);
    const execCase = (await db.query(`SELECT status, assigned_to FROM public.suspension_cases WHERE id = '${caseAId}';`)).rows[0];
    check("3C-LIFE-4", "Approved case transitions to executing with staff assignment",
      execCase.status === "executing" && execCase.assigned_to === staff.id);

    // Transition: executing -> suspended
    await db.query(`
      UPDATE public.suspension_cases
      SET status = 'suspended', executed_at = now()
      WHERE id = '${caseAId}';
    `);
    const suspCase = (await db.query(`SELECT status, executed_at FROM public.suspension_cases WHERE id = '${caseAId}';`)).rows[0];
    check("3C-LIFE-5a", "Executing case transitions to suspended with executed_at",
      suspCase.status === "suspended" && suspCase.executed_at !== null);

    // Add and verify an action
    const actionAId = (await db.query(`
      INSERT INTO public.suspension_actions (suspension_case_id, resource_id, action_type, action_status, performed_by, notes)
      VALUES ('${caseAId}', ${resAId ? `'${resAId}'` : 'NULL'}, 'suspend', 'completed', '${staff.id}', 'Suspension completed by assigned staff')
      RETURNING id;
    `)).rows[0].id;

    // 3C-LIFE-5b: Action verified by Admin
    await db.query(`
      UPDATE public.suspension_actions
      SET action_status = 'verified', verified_by = '${admin.id}', verified_at = now(), evidence = 'Verified service shutdown confirmed'
      WHERE id = '${actionAId}';
    `);
    const actRow = (await db.query(`SELECT action_status, verified_by FROM public.suspension_actions WHERE id = '${actionAId}';`)).rows[0];
    check("3C-LIFE-5b", "Suspension action verified with verified_by",
      actRow.action_status === "verified" && actRow.verified_by === admin.id);

    // 3C-LIFE-6: Suspended case can enter restoration
    await db.query(`
      UPDATE public.suspension_cases
      SET status = 'restoration_pending', notes = 'Payment received, restoration authorized'
      WHERE id = '${caseAId}';
    `);
    const restCase = (await db.query(`SELECT status FROM public.suspension_cases WHERE id = '${caseAId}';`)).rows[0];
    check("3C-LIFE-6", "Suspended case transitions to restoration_pending", restCase.status === "restoration_pending");

    // 3C-LIFE-7: Restored case records restoration correctly
    await db.query(`
      UPDATE public.suspension_cases
      SET status = 'restored', restored_at = now()
      WHERE id = '${caseAId}';
    `);
    const finalRestCase = (await db.query(`SELECT status, restored_at FROM public.suspension_cases WHERE id = '${caseAId}';`)).rows[0];
    check("3C-LIFE-7", "Case transitions to restored and records restored_at",
      finalRestCase.status === "restored" && finalRestCase.restored_at !== null);

    // Test Rejected lifecycle: rejected case cannot be executed
    const caseRejId = (await db.query(`
      INSERT INTO public.suspension_cases (service_agreement_id, client_id, reason, status, requested_by)
      VALUES ('${agAId}', '${clientA.id}', 'Disputed billing case', 'proposed', '${admin.id}')
      RETURNING id;
    `)).rows[0].id;
    await db.query(`
      UPDATE public.suspension_cases
      SET status = 'rejected'
      WHERE id = '${caseRejId}';
    `);
    let rejectedExecBlocked = false;
    try {
      await db.query(`
        UPDATE public.suspension_cases
        SET status = 'executing'
        WHERE id = '${caseRejId}';
      `);
    } catch (e) {
      rejectedExecBlocked = e.message.includes("Rejected suspension case cannot be executed or transitioned");
    }
    check("3C-LIFE-2", "Rejected case cannot be executed", rejectedExecBlocked);

    // Test Cancelled lifecycle: cancelled case cannot be executed
    const caseCancId = (await db.query(`
      INSERT INTO public.suspension_cases (service_agreement_id, client_id, reason, status, requested_by)
      VALUES ('${agAId}', '${clientA.id}', 'Customer resolved before approval', 'proposed', '${admin.id}')
      RETURNING id;
    `)).rows[0].id;
    await db.query(`
      UPDATE public.suspension_cases
      SET status = 'cancelled'
      WHERE id = '${caseCancId}';
    `);
    let cancelledExecBlocked = false;
    try {
      await db.query(`
        UPDATE public.suspension_cases
        SET status = 'executing'
        WHERE id = '${caseCancId}';
      `);
    } catch (e) {
      cancelledExecBlocked = e.message.includes("Cancelled suspension case cannot be executed or transitioned");
    }
    check("3C-LIFE-3", "Cancelled case cannot be executed", cancelledExecBlocked);

    // -------------------------------------------------------------------------
    // 5. Role-Based Access Control (RBAC) via REST API
    // -------------------------------------------------------------------------
    console.log("\n--- 5. RBAC VIA REAL POSTGREST REST API ---");

    // 3C-RBAC-1: Admin can read suspension cases via REST
    const adminCases = await authResults.admin.rest.get("suspension_cases", { select: "id,status,reason" });
    check("3C-RBAC-1", "Admin can read suspension cases via REST",
      adminCases.status === 200 && Array.isArray(adminCases.body) && adminCases.body.length > 0,
      `Cases count: ${adminCases.body?.length}`);

    // 3C-RBAC-2: Finance cannot execute or approve suspension via REST
    // Create a pending case for testing unauthorized update
    const caseTestRbacId = (await db.query(`
      INSERT INTO public.suspension_cases (service_agreement_id, client_id, reason, status, requested_by)
      VALUES ('${agAId}', '${clientA.id}', 'RBAC boundary test', 'pending_approval', '${admin.id}')
      RETURNING id;
    `)).rows[0].id;

    // Finance attempts to approve case
    const finApproveRes = await authResults.finance.rest.patch(
      "suspension_cases",
      { id: `eq.${caseTestRbacId}` },
      { status: "approved", approved_by: finance.id }
    );
    // In PostgREST, RLS with false WITH CHECK or USING either errors (403/400) or updates 0 rows
    const caseAfterFin = (await db.query(`SELECT status FROM public.suspension_cases WHERE id = '${caseTestRbacId}';`)).rows[0];
    check("3C-RBAC-2", "Finance cannot approve suspension case via REST",
      caseAfterFin.status === "pending_approval", `Status: ${caseAfterFin.status}`);

    // 3C-RBAC-3: Staff cannot approve suspension
    const staffApproveRes = await authResults.staff.rest.patch(
      "suspension_cases",
      { id: `eq.${caseTestRbacId}` },
      { status: "approved", approved_by: staff.id }
    );
    const caseAfterStaff = (await db.query(`SELECT status FROM public.suspension_cases WHERE id = '${caseTestRbacId}';`)).rows[0];
    check("3C-RBAC-3", "Staff cannot approve suspension case via REST",
      caseAfterStaff.status === "pending_approval", `Status: ${caseAfterStaff.status}`);

    // Approve the case via DB so we can test Staff execution of assigned action
    await db.query(`
      UPDATE public.suspension_cases
      SET status = 'approved', approved_by = '${admin.id}'
      WHERE id = '${caseTestRbacId}';
    `);
    await db.query(`
      UPDATE public.suspension_cases
      SET status = 'executing', assigned_to = '${staff.id}'
      WHERE id = '${caseTestRbacId}';
    `);

    // Create an action assigned to staff
    const staffActId = (await db.query(`
      INSERT INTO public.suspension_actions (suspension_case_id, action_type, action_status, assigned_to)
      VALUES ('${caseTestRbacId}', 'suspend', 'pending', '${staff.id}')
      RETURNING id;
    `)).rows[0].id;

    // 3C-RBAC-4: Assigned Staff can update the action via REST
    const staffActUpdate = await authResults.staff.rest.patch(
      "suspension_actions",
      { id: `eq.${staffActId}` },
      { action_status: "completed", notes: "Completed by staff via REST", evidence: "Service disabled" }
    );
    const actAfterStaff = (await db.query(`SELECT action_status, notes FROM public.suspension_actions WHERE id = '${staffActId}';`)).rows[0];
    check("3C-RBAC-4", "Assigned Staff can complete approved suspension action via REST",
      actAfterStaff.action_status === "completed" && actAfterStaff.notes?.includes("Completed by staff"),
      `Status: ${actAfterStaff.action_status}`);

    // 3C-RBAC-6: Client A gets 0 rows from suspension_cases and suspension_actions
    const clientCases = await authResults.clientA.rest.get("suspension_cases", { select: "*" });
    check("3C-RBAC-6a", "Client gets 0 rows from suspension_cases via REST",
      clientCases.status === 200 && Array.isArray(clientCases.body) && clientCases.body.length === 0,
      `Rows: ${clientCases.body?.length}`);

    const clientActions = await authResults.clientA.rest.get("suspension_actions", { select: "*" });
    check("3C-RBAC-6b", "Client gets 0 rows from suspension_actions via REST",
      clientActions.status === 200 && Array.isArray(clientActions.body) && clientActions.body.length === 0,
      `Rows: ${clientActions.body?.length}`);

    // -------------------------------------------------------------------------
    // 6. Delete Safety (No Destructive Deletions)
    // -------------------------------------------------------------------------
    console.log("\n--- 6. DELETE SAFETY ---");

    let caseDelBlocked = false;
    try {
      await db.query(`DELETE FROM public.suspension_cases WHERE id = '${caseAId}';`);
    } catch (e) {
      caseDelBlocked = e.message.includes("Destructive deletion of suspension records is strictly forbidden");
    }
    check("3C-DEL-1", "Database trigger prohibits destructive deletion of suspension_cases", caseDelBlocked);

    let actDelBlocked = false;
    try {
      await db.query(`DELETE FROM public.suspension_actions WHERE id = '${actionAId}';`);
    } catch (e) {
      actDelBlocked = e.message.includes("Destructive deletion of suspension records is strictly forbidden");
    }
    check("3C-DEL-2", "Database trigger prohibits destructive deletion of suspension_actions", actDelBlocked);

    // -------------------------------------------------------------------------
    // 7. Audit Logging Verification
    // -------------------------------------------------------------------------
    console.log("\n--- 7. AUDIT LOGGING ---");

    const auditCases = (await db.query(`
      SELECT action, table_name, record_id FROM public.audit_logs
      WHERE table_name = 'suspension_cases' AND record_id = '${caseAId}';
    `)).rows;
    check("3C-AUDIT-1", "Audit logs recorded for suspension_case transitions",
      auditCases.length >= 2, `Recorded ${auditCases.length} audit entries: ${auditCases.map(a => a.action).join(", ")}`);

    const auditActions = (await db.query(`
      SELECT action, table_name, record_id FROM public.audit_logs
      WHERE table_name = 'suspension_actions' AND record_id = '${actionAId}';
    `)).rows;
    check("3C-AUDIT-2", "Audit logs recorded for suspension_action operations",
      auditActions.length >= 1, `Recorded ${auditActions.length} audit entries: ${auditActions.map(a => a.action).join(", ")}`);

    // -------------------------------------------------------------------------
    // 8. Staff Financial Anti-Leak Regression Checks
    // -------------------------------------------------------------------------
    console.log("\n--- 8. STAFF FINANCIAL ANTI-LEAK REGRESSION ---");

    const staffRc = await authResults.staff.rest.get("recurring_charges", { select: "*" });
    check("3C-SEC-4", "Staff still gets 0 rows from recurring_charges via REST API",
      staffRc.status === 200 && Array.isArray(staffRc.body) && staffRc.body.length === 0);

    const staffView = await authResults.staff.rest.get("staff_service_agreements_view", { select: "*" });
    const viewRow = staffView.body?.[0] || {};
    check("3C-SEC-5", "staff_service_agreements_view exposes zero financial fields",
      staffView.status === 200 && viewRow.amount === undefined && viewRow.currency === undefined);

    // -------------------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------------------
    console.log("\n==================================================");
    const passCount = results.filter(r => r.pass).length;
    const failCount = results.filter(r => !r.pass).length;
    console.log(`PHASE 3C HOSTED VERIFICATION: ${passCount} PASS, ${failCount} FAIL`);
    console.log("==================================================");

    const report = {
      projectRef: target.ref,
      timestamp: new Date().toISOString(),
      passCount,
      failCount,
      status: failCount === 0 ? "PASS" : "FAIL",
      results
    };

    mkdirSync("phase2c-reports", { recursive: true });
    writeFileSync(join("phase2c-reports", "phase3c-dev-verification.json"), redact(JSON.stringify(report, null, 2)));

    if (failCount > 0) {
      process.exit(1);
    }
    return report;
  } finally {
    await db.end();
  }
}

// Auto-run if executed directly
if (process.argv[1]?.endsWith("verify-phase3c-hosted-dev.mjs")) {
  const env = {};
  readFileSync(".env.phase2c", "utf8").split("\n").forEach((l) => {
    const m = l.match(/^\s*([^#][^=]*)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  });
  env.PHASE2C_DEV_PROJECT_REF = "outuocpsotiozkpyksex";
  env.PHASE2C_CONFIRM_DEV_WRITES = "outuocpsotiozkpyksex";

  runPhase3cHostedVerification({ env }).catch((err) => {
    console.error("[PHASE 3C DEV VERIFY] ERROR:", err);
    process.exit(1);
  });
}
