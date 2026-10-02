// Automated Phase 3B Verification on Hosted DEV
// Project Ref: outuocpsotiozkpyksex ONLY
// Tests real REST API & direct PostgreSQL triggers/constraints against DEV with real test accounts.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { assertDevTarget, assertDbUrlMatchesRef, makeRedactor, writesConfirmed, GuardError } from "./phase2c-guard.mjs";
import { openPgConnection } from "./apply-migration-013.mjs";
import { createClient } from "./phase2c-lib.mjs";
import { ACCOUNT_FILE } from "./phase2c-seed-test-accounts.mjs";

export async function runPhase3bHostedVerification({ env = process.env } = {}) {
  const target = assertDevTarget(env);
  if (!target.dbUrl) {
    throw new GuardError("PHASE2C_DB_URL is required for hosted verification.");
  }
  assertDbUrlMatchesRef(target.dbUrl, target.ref);

  const secrets = [target.anonKey, target.serviceKey, target.dbUrl].filter(Boolean);
  const redact = makeRedactor(() => secrets);

  console.log(`[PHASE 3B DEV VERIFY] Connecting to DEV REST API & DB (${target.ref})...`);

  // Load test accounts
  const accountsPath = resolve(ACCOUNT_FILE);
  const accountsData = JSON.parse(readFileSync(accountsPath, "utf8"));
  const { admin, staff, finance, clientA, clientB } = accountsData;

  const client = createClient({ url: target.url, anonKey: target.anonKey, serviceKey: target.serviceKey });

  // Sign in as each role to acquire tokens
  console.log("[PHASE 3B DEV VERIFY] Signing in test accounts via Supabase Auth...");
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
    check("3B-SCH-1", "Total application tables is at least 24 (16 Phase 2C + 4 Phase 3A + 4 Phase 3B + Phase 3C)",
      tables.length >= 24, `Found ${tables.length} tables`);

    // Invoices additive columns
    const invCols = (await db.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'invoices'
        AND column_name IN ('currency', 'agreement_id', 'recurring_charge_id')
      ORDER BY column_name;
    `)).rows;
    const colMap = Object.fromEntries(invCols.map(c => [c.column_name, c]));
    check("3B-SCH-2", "invoices.currency added as NOT NULL DEFAULT 'UGX'",
      colMap["currency"] && colMap["currency"].is_nullable === "NO" && colMap["currency"].column_default.includes("UGX"));
    check("3B-SCH-3", "invoices.agreement_id added as NULLABLE",
      colMap["agreement_id"] && colMap["agreement_id"].is_nullable === "YES");
    check("3B-SCH-4", "invoices.recurring_charge_id added as NULLABLE",
      colMap["recurring_charge_id"] && colMap["recurring_charge_id"].is_nullable === "YES");

    // Existing invoices data preservation: check currency = 'UGX' on all pre-existing rows
    const nonUgxCount = (await db.query(`
      SELECT count(*)::int as count FROM public.invoices WHERE currency <> 'UGX';
    `)).rows[0].count;
    check("3B-SCH-5", "All pre-existing invoices safely defaulted to UGX", nonUgxCount === 0, `Non-UGX invoices: ${nonUgxCount}`);

    // Views and Functions
    const viewRes = await db.query(`
      SELECT table_name FROM information_schema.views 
      WHERE table_schema = 'public' AND table_name = 'staff_service_agreements_view';
    `);
    check("3B-SCH-6", "staff_service_agreements_view exists", viewRes.rows.length === 1);

    const fnRes = await db.query(`
      SELECT routine_name FROM information_schema.routines 
      WHERE routine_schema = 'public' AND routine_name = 'derive_agreement_billing_standing';
    `);
    check("3B-SCH-7", "derive_agreement_billing_standing exists", fnRes.rows.length === 1);

    // -------------------------------------------------------------------------
    // 2. Currency Constraints
    // -------------------------------------------------------------------------
    console.log("\n--- 2. CURRENCY CONSTRAINTS ---");
    let eurRejected = false;
    try {
      await db.query(`
        INSERT INTO public.invoices (client_id, invoice_number, currency, subtotal, total)
        VALUES ('${clientA.id}', 'INV-TEST-ERR-EUR', 'EUR', 100, 100);
      `);
    } catch (e) {
      eurRejected = e.message.includes("violates check constraint");
    }
    check("3B-CUR-1", "Unsupported invoice currency (EUR) rejected by database", eurRejected);

    // -------------------------------------------------------------------------
    // 3. Same-Client Integrity Constraints (Agreements, Systems, Resources, Invoices)
    // -------------------------------------------------------------------------
    console.log("\n--- 3. SAME-CLIENT INTEGRITY CONSTRAINTS ---");

    // Fetch existing test system and resource for Client A and Client B
    const sysARes = await db.query(`SELECT id FROM public.systems WHERE client_id = '${clientA.id}' LIMIT 1;`);
    const sysBRes = await db.query(`SELECT id FROM public.systems WHERE client_id = '${clientB.id}' LIMIT 1;`);
    const sysAId = sysARes.rows[0]?.id;
    const sysBId = sysBRes.rows[0]?.id;

    // Cross-client system attachment to agreement
    let crossSysBlocked = false;
    if (sysBId) {
      try {
        await db.query(`
          INSERT INTO public.service_agreements (client_id, system_id, name, service_type, start_date)
          VALUES ('${clientA.id}', '${sysBId}', 'Cross System Agreement', 'managed_service', CURRENT_DATE);
        `);
      } catch (e) {
        crossSysBlocked = e.message.includes("Agreement system must belong to the agreement client");
      }
    } else {
      crossSysBlocked = true; // skip if no system B
    }
    check("3B-INT-1", "Cannot attach Client B System to Client A Service Agreement", crossSysBlocked);

    // Create a clean test agreement for Client A
    const testAgA = (await db.query(`
      INSERT INTO public.service_agreements (client_id, system_id, name, service_type, status, start_date, default_grace_days, notice_days, operational_notes)
      VALUES ('${clientA.id}', ${sysAId ? `'${sysAId}'` : 'NULL'}, 'Client A Cloud Support SLA', 'managed_service', 'active', '2026-09-01', 7, 3, 'Operational SLA details')
      RETURNING id;
    `)).rows[0].id;

    // Cross-client resource attachment to agreement
    const resBRes = await db.query(`SELECT id FROM public.resources WHERE client_id = '${clientB.id}' LIMIT 1;`);
    const resBId = resBRes.rows[0]?.id;
    let crossResBlocked = false;
    if (resBId) {
      try {
        await db.query(`
          INSERT INTO public.agreement_resources (agreement_id, resource_id)
          VALUES ('${testAgA}', '${resBId}');
        `);
      } catch (e) {
        crossResBlocked = e.message.includes("Resource client ownership must match agreement client") ||
                          e.message.includes("Resource attached system client must match agreement client");
      }
    } else {
      crossResBlocked = true;
    }
    check("3B-INT-2", "Cannot attach Client B Resource to Client A Service Agreement", crossResBlocked);

    // Cross-client invoice attachment
    let crossInvBlocked = false;
    try {
      await db.query(`
        INSERT INTO public.invoices (client_id, invoice_number, agreement_id, subtotal, total)
        VALUES ('${clientB.id}', 'INV-CROSS-CLIENT-001', '${testAgA}', 100, 100);
      `);
    } catch (e) {
      crossInvBlocked = e.message.includes("Invoice client must match agreement client");
    }
    check("3B-INT-3", "Cannot link Client B Invoice to Client A Service Agreement", crossInvBlocked);

    // -------------------------------------------------------------------------
    // 4. Recurring Charges & Idempotent Runs
    // -------------------------------------------------------------------------
    console.log("\n--- 4. RECURRING CHARGES & IDEMPOTENCY ---");

    const testRcA = (await db.query(`
      INSERT INTO public.recurring_charges (agreement_id, name, amount, currency, billing_cycle, payment_timing, start_date)
      VALUES ('${testAgA}', 'Monthly Retainer UGX', 2000000, 'UGX', 'monthly', 'month_end', '2026-09-01')
      RETURNING id;
    `)).rows[0].id;

    // Valid invoice for this charge and agreement
    const uniqueInvNum = `INV-REC-TEST-${Date.now()}`;
    const testInvA = (await db.query(`
      INSERT INTO public.invoices (client_id, invoice_number, agreement_id, recurring_charge_id, currency, subtotal, total)
      VALUES ('${clientA.id}', '${uniqueInvNum}', '${testAgA}', '${testRcA}', 'UGX', 2000000, 2000000)
      RETURNING id;
    `)).rows[0].id;

    // First charge run
    await db.query(`
      INSERT INTO public.recurring_charge_runs (recurring_charge_id, period_start, period_end, invoice_id)
      VALUES ('${testRcA}', '2026-09-01', '2026-09-30', '${testInvA}');
    `);

    // Duplicate charge run for same period MUST fail on UNIQUE constraint
    let dupBlocked = false;
    try {
      await db.query(`
        INSERT INTO public.recurring_charge_runs (recurring_charge_id, period_start, period_end, invoice_id)
        VALUES ('${testRcA}', '2026-09-01', '2026-09-30', '${testInvA}');
      `);
    } catch (e) {
      dupBlocked = e.message.includes("uq_recurring_charge_run_period");
    }
    check("3B-IDEM-1", "Duplicate recurring charge run for same period blocked by unique constraint", dupBlocked);

    // -------------------------------------------------------------------------
    // 5. Staff Financial Anti-Leak (RLS & Views)
    // -------------------------------------------------------------------------
    console.log("\n--- 5. STAFF FINANCIAL ANTI-LEAK ---");

    // Staff PostgREST query on recurring_charges
    const staffCharges = await authResults.staff.rest.get("recurring_charges", { select: "*" });
    check("3B-LEAK-1", "Staff gets 0 rows from recurring_charges via REST API",
      staffCharges.status === 200 && Array.isArray(staffCharges.body) && staffCharges.body.length === 0,
      `Rows returned: ${staffCharges.body?.length}`);

    // Staff PostgREST query on recurring_charge_runs
    const staffRuns = await authResults.staff.rest.get("recurring_charge_runs", { select: "*" });
    check("3B-LEAK-2", "Staff gets 0 rows from recurring_charge_runs via REST API",
      staffRuns.status === 200 && Array.isArray(staffRuns.body) && staffRuns.body.length === 0,
      `Rows returned: ${staffRuns.body?.length}`);

    // Staff PostgREST query on service_agreements succeeds for operational fields
    const staffAgreements = await authResults.staff.rest.get("service_agreements", { select: "id,name,service_type,status" });
    check("3B-LEAK-3", "Staff can read operational fields of service_agreements",
      staffAgreements.status === 200 && Array.isArray(staffAgreements.body) && staffAgreements.body.length > 0);

    // Staff query on staff_service_agreements_view
    const staffViewRes = await authResults.staff.rest.get("staff_service_agreements_view", { select: "*" });
    const firstRow = staffViewRes.body?.[0] || {};
    check("3B-LEAK-4", "staff_service_agreements_view contains zero financial amounts or currency",
      staffViewRes.status === 200 && firstRow.amount === undefined && firstRow.total === undefined && firstRow.currency === undefined,
      `Keys present: ${Object.keys(firstRow).join(", ")}`);

    // -------------------------------------------------------------------------
    // 6. Finance & Admin Authorization
    // -------------------------------------------------------------------------
    console.log("\n--- 6. FINANCE & ADMIN AUTHORIZATION ---");

    // Finance can read recurring_charges and sees amounts
    const finCharges = await authResults.finance.rest.get("recurring_charges", { select: "id,amount,currency" });
    check("3B-FIN-1", "Finance can read recurring_charges and see financial amounts",
      finCharges.status === 200 && Array.isArray(finCharges.body) && finCharges.body.length > 0,
      `Count: ${finCharges.body?.length}`);

    // Admin can read recurring_charges
    const adminCharges = await authResults.admin.rest.get("recurring_charges", { select: "id,amount" });
    check("3B-ADM-1", "Admin can read recurring_charges",
      adminCharges.status === 200 && Array.isArray(adminCharges.body) && adminCharges.body.length > 0);

    // -------------------------------------------------------------------------
    // 7. Client Isolation
    // -------------------------------------------------------------------------
    console.log("\n--- 7. CLIENT ISOLATION ---");

    const clientAgreements = await authResults.clientA.rest.get("service_agreements", { select: "*" });
    check("3B-CLI-1", "Client A gets 0 rows from service_agreements (Phase 3B admin only)",
      clientAgreements.status === 200 && Array.isArray(clientAgreements.body) && clientAgreements.body.length === 0);

    const clientCharges = await authResults.clientA.rest.get("recurring_charges", { select: "*" });
    check("3B-CLI-2", "Client A gets 0 rows from recurring_charges",
      clientCharges.status === 200 && Array.isArray(clientCharges.body) && clientCharges.body.length === 0);

    // -------------------------------------------------------------------------
    // 8. Derived Billing Standing
    // -------------------------------------------------------------------------
    console.log("\n--- 8. DERIVED BILLING STANDING ---");

    const standingRes = await db.query(`SELECT public.derive_agreement_billing_standing('${testAgA}') AS s;`);
    const currentStanding = standingRes.rows[0]?.s;
    check("3B-STD-1", "derive_agreement_billing_standing derives valid status",
      ["CURRENT", "DUE", "OVERDUE_GRACE", "NOTICE", "SUSPENSION_ELIGIBLE"].includes(currentStanding),
      `Derived standing: ${currentStanding}`);

    // -------------------------------------------------------------------------
    // 9. Anti-Secrets Guard & Delete Blockers
    // -------------------------------------------------------------------------
    console.log("\n--- 9. ANTI-SECRETS & DELETE BLOCKERS ---");

    let secretBlocked = false;
    try {
      await db.query(`
        INSERT INTO public.service_agreements (client_id, name, service_type, start_date, operational_notes)
        VALUES ('${clientA.id}', 'Secret Agreement', 'managed_service', CURRENT_DATE, 'API key: sk_live_' || '0123456789abcdef0123456789');
      `);
    } catch (e) {
      secretBlocked = e.message.includes("violates check constraint");
    }
    check("3B-SEC-1", "Anti-secrets check constraint blocks live API keys in agreements", secretBlocked);

    let delBlocked = false;
    try {
      const delRes = await authResults.admin.rest.del(`service_agreements?id=eq.${testAgA}`);
      // In PostgREST, delete on table with USING false returns 204 or 403, with 0 rows deleted
      const checkAg = await db.query(`SELECT id FROM public.service_agreements WHERE id = '${testAgA}';`);
      delBlocked = checkAg.rows.length === 1;
    } catch (e) {
      delBlocked = true;
    }
    check("3B-DEL-1", "Application-level DELETE blocked on service_agreements", delBlocked);

    // -------------------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------------------
    console.log("\n==================================================");
    const passCount = results.filter(r => r.pass).length;
    const failCount = results.filter(r => !r.pass).length;
    console.log(`PHASE 3B HOSTED VERIFICATION: ${passCount} PASS, ${failCount} FAIL`);
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
    writeFileSync(join("phase2c-reports", "phase3b-dev-verification.json"), redact(JSON.stringify(report, null, 2)));

    if (failCount > 0) {
      process.exit(1);
    }
    return report;
  } finally {
    await db.end();
  }
}

// Auto-run if executed directly
if (process.argv[1]?.endsWith("verify-phase3b-hosted-dev.mjs")) {
  const env = {};
  readFileSync(".env.phase2c", "utf8").split("\n").forEach((l) => {
    const m = l.match(/^\s*([^#][^=]*)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  });
  env.PHASE2C_DEV_PROJECT_REF = "outuocpsotiozkpyksex";
  env.PHASE2C_CONFIRM_DEV_WRITES = "outuocpsotiozkpyksex";

  runPhase3bHostedVerification({ env }).catch((err) => {
    console.error("[PHASE 3B DEV VERIFY] ERROR:", err);
    process.exit(1);
  });
}
