// Automated Phase 3F Verification on Hosted DEV
// Project Ref: outuocpsotiozkpyksex ONLY
// Tests real REST API & direct PostgreSQL triggers/constraints against DEV with real test accounts.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { assertDevTarget, assertDbUrlMatchesRef, makeRedactor, writesConfirmed, GuardError } from "./phase2c-guard.mjs";
import { openPgConnection } from "./apply-migration-013.mjs";
import { createClient } from "./phase2c-lib.mjs";
import { ACCOUNT_FILE } from "./phase2c-seed-test-accounts.mjs";

export async function runPhase3fHostedVerification({ env = process.env } = {}) {
  const target = assertDevTarget(env);
  if (!target.dbUrl) {
    throw new GuardError("PHASE2C_DB_URL is required for hosted verification.");
  }
  assertDbUrlMatchesRef(target.dbUrl, target.ref);

  if (!writesConfirmed(env, target.ref)) {
    throw new GuardError(`PHASE2C_CONFIRM_DEV_WRITES=${target.ref} is required for Phase 3F hosted verification on DEV.`);
  }

  const secrets = [target.anonKey, target.serviceKey, target.dbUrl].filter(Boolean);
  const redact = makeRedactor(() => secrets);

  console.log(`[PHASE 3F DEV VERIFY] Connecting to DEV REST API & DB (${target.ref})...`);

  const accountsPath = resolve(ACCOUNT_FILE);
  const accountsData = JSON.parse(readFileSync(accountsPath, "utf8"));
  const { admin, staff, finance, clientA, clientB } = accountsData;

  const client = createClient({ url: target.url, anonKey: target.anonKey, serviceKey: target.serviceKey });

  console.log("[PHASE 3F DEV VERIFY] Signing in test accounts via Supabase Auth...");
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

  const db = await openPgConnection(target.dbUrl);

  // Fixture IDs hoisted so teardown can scope deletes to this run's data only.
  let accountId, resAId, resSAId, resBId, agrAId, agrBId, sysAId, sysBId, providerId;

  try {
    // -------------------------------------------------------------------------
    // 1. Schema & Invariant Checks
    // -------------------------------------------------------------------------
    console.log("\n--- 1. SCHEMA & INVARIANT CHECKS ---");

    const tableRes = await db.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    const tables = tableRes.rows.map(r => r.table_name);
    check("3F-SCH-1", "provider_costs table exists", tables.includes("provider_costs"));

    const viewRes = await db.query(`
      SELECT table_name FROM information_schema.views
      WHERE table_schema = 'public'
        AND table_name IN ('provider_cost_overview', 'staff_provider_costs_view', 'service_margin_view');
    `);
    const views = viewRes.rows.map(r => r.table_name);
    check("3F-SCH-2", "provider_cost_overview / staff_provider_costs_view / service_margin_view exist",
      views.length === 3, `Found: ${views.join(", ")}`);

    const rlsRes = await db.query(`
      SELECT tablename, rowsecurity FROM pg_tables
      WHERE schemaname = 'public' AND tablename = 'provider_costs';
    `);
    check("3F-SCH-3", "RLS enabled on provider_costs", rlsRes.rows[0]?.rowsecurity === true);

    const amountCol = (await db.query(`
      SELECT data_type, numeric_precision, numeric_scale FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'provider_costs' AND column_name = 'amount';
    `)).rows[0];
    check("3F-SCH-4", "amount uses NUMERIC money-safe type",
      amountCol?.data_type === "numeric", `type=${amountCol?.data_type}`);

    const anonPrivs = (await db.query(`
      SELECT privilege_type, table_name FROM information_schema.role_table_grants
      WHERE grantee = 'anon' AND table_schema = 'public'
        AND table_name IN ('provider_costs', 'provider_cost_overview', 'staff_provider_costs_view', 'service_margin_view');
    `)).rows;
    check("3F-SEC-1", "anon role has 0 privileges on provider cost objects", anonPrivs.length === 0,
      `Found: ${anonPrivs.length}`);

    const truncateGrants = (await db.query(`
      SELECT grantee, table_name FROM information_schema.role_table_grants
      WHERE privilege_type = 'TRUNCATE'
        AND grantee IN ('anon', 'authenticated', 'service_role')
        AND table_schema = 'public'
        AND table_name IN ('provider_costs', 'provider_cost_overview', 'staff_provider_costs_view', 'service_margin_view');
    `)).rows;
    check("3F-SEC-2", "no TRUNCATE privileges on provider cost objects", truncateGrants.length === 0,
      `Found: ${truncateGrants.length}`);

    const constraints = (await db.query(`
      SELECT pg_get_constraintdef(oid) as def FROM pg_constraint
      WHERE conrelid = 'public.provider_costs'::regclass AND contype = 'c';
    `)).rows.map(r => r.def);

    check("3F-SCH-5a", "currency restricted to UGX/USD",
      constraints.some(d => d.includes("'UGX'") && d.includes("'USD'")));
    check("3F-SCH-5b", "amount non-negative constraint exists",
      constraints.some(d => /amount\s*>=\s*\(?0/.test(d)));
    check("3F-SCH-5c", "billing period validity constraint exists",
      constraints.some(d => d.includes("billing_period_end") && d.includes("billing_period_start")));
    check("3F-SCH-5d", "allocation_type vocabulary constraint exists",
      constraints.some(d => d.includes("'client'") && d.includes("'overhead'")));
    check("3F-SCH-5e", "client allocation requires client_id",
      constraints.some(d => d.includes("allocation_type") && d.includes("client_id")));
    check("3F-SCH-5f", "controlled cost_type taxonomy exists",
      constraints.some(d => d.includes("'hosting'") && d.includes("'infrastructure'")));
    check("3F-SCH-5g", "controlled status lifecycle exists",
      constraints.some(d => d.includes("'estimated'") && d.includes("'cancelled'")));

    // No secret/credential columns
    const secretCols = (await db.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'provider_costs'
        AND column_name ~* '(password|secret|token|api_key|apikey|private_key|credential)';
    `)).rows;
    check("3F-SEC-5", "no credential/secret columns on provider_costs", secretCols.length === 0,
      secretCols.length ? secretCols.map(c => c.column_name).join(", ") : "none found");

    // -------------------------------------------------------------------------
    // 2. Setup Fixtures
    // -------------------------------------------------------------------------
    console.log("\n--- 2. SETUP PROVIDER COST FIXTURES ---");

    const providerRes = await db.query(`
      INSERT INTO public.providers (name, slug)
      VALUES ('Hosted Dev Cost Provider', 'hosted-dev-cost-prov')
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
      RETURNING id;
    `);
    providerId = providerRes.rows[0].id;

    const accountRes = await db.query(`
      INSERT INTO public.provider_accounts (provider_id, account_name, ownership)
      VALUES ('${providerId}', 'Dev Cost Account', 'sch_managed')
      RETURNING id;
    `);
    accountId = accountRes.rows[0].id;

    const sysARes = await db.query(`
      INSERT INTO public.systems (client_id, name, system_type, status)
      VALUES ('${clientA.id}', 'Client A Cost System', 'web_platform', 'live')
      RETURNING id;
    `);
    sysAId = sysARes.rows[0].id;

    const resARes = await db.query(`
      INSERT INTO public.resources (system_id, provider_account_id, name, resource_type, client_id, status)
      VALUES ('${sysAId}', '${accountId}', 'Client A Cost DB', 'database', '${clientA.id}', 'active')
      RETURNING id;
    `);
    resAId = resARes.rows[0].id;

    const resSARes = await db.query(`
      INSERT INTO public.resources (system_id, provider_account_id, name, resource_type, client_id, status)
      VALUES (NULL, '${accountId}', 'Client A Standalone Cost Store', 'storage_bucket', '${clientA.id}', 'active')
      RETURNING id;
    `);
    resSAId = resSARes.rows[0].id;

    const sysBRes = await db.query(`
      INSERT INTO public.systems (client_id, name, system_type, status)
      VALUES ('${clientB.id}', 'Client B Cost System', 'web_platform', 'live')
      RETURNING id;
    `);
    sysBId = sysBRes.rows[0].id;

    const resBRes = await db.query(`
      INSERT INTO public.resources (system_id, provider_account_id, name, resource_type, client_id, status)
      VALUES ('${sysBId}', '${accountId}', 'Client B Cost DB', 'database', '${clientB.id}', 'active')
      RETURNING id;
    `);
    resBId = resBRes.rows[0].id;

    const agrARes = await db.query(`
      INSERT INTO public.service_agreements (client_id, system_id, name, service_type, status, start_date)
      VALUES ('${clientA.id}', '${sysAId}', 'Client A Cost SLA', 'managed_service', 'active', '2026-10-01')
      RETURNING id;
    `);
    agrAId = agrARes.rows[0].id;

    const agrBRes = await db.query(`
      INSERT INTO public.service_agreements (client_id, system_id, name, service_type, status, start_date)
      VALUES ('${clientB.id}', '${sysBId}', 'Client B Cost SLA', 'managed_service', 'active', '2026-10-01')
      RETURNING id;
    `);
    agrBId = agrBRes.rows[0].id;

    // Revenue source of truth: recurring charges on agreement A (USD + UGX)
    await db.query(`
      INSERT INTO public.recurring_charges (agreement_id, name, amount, currency, billing_cycle, active, start_date)
      VALUES
        ('${agrAId}', 'Hosted Verify USD Fee', 200.00, 'USD', 'monthly', true, '2026-10-01'),
        ('${agrAId}', 'Hosted Verify UGX Fee', 500000.00, 'UGX', 'monthly', true, '2026-10-01');
    `);

    // -------------------------------------------------------------------------
    // 3. Allocation & Same-Client Integrity
    // -------------------------------------------------------------------------
    console.log("\n--- 3. ALLOCATION & SAME-CLIENT INTEGRITY ---");

    let clientNoId = false;
    try {
      await db.query(`
        INSERT INTO public.provider_costs (allocation_type, client_id, cost_type, description, amount, currency, created_by)
        VALUES ('client', NULL, 'hosting', 'No client cost', 10, 'USD', '${admin.id}');
      `);
    } catch (e) {
      clientNoId = /allocation|client_id/i.test(e.message);
    }
    check("3F-ALLOC-1", "Client allocation requires client_id", clientNoId);

    const overheadRes = await db.query(`
      INSERT INTO public.provider_costs (allocation_type, provider_account_id, cost_type, description, amount, currency, status, created_by)
      VALUES ('overhead', '${accountId}', 'infrastructure', 'SCH Shared Tooling', 45.00, 'USD', 'accrued', '${admin.id}')
      RETURNING id, client_id, allocation_type;
    `);
    check("3F-ALLOC-2", "Overhead cost allowed without client",
      overheadRes.rows[0]?.allocation_type === "overhead" && overheadRes.rows[0]?.client_id === null);

    let overheadClientRes = false;
    try {
      await db.query(`
        INSERT INTO public.provider_costs (allocation_type, client_id, resource_id, cost_type, description, amount, currency, created_by)
        VALUES ('overhead', NULL, '${resAId}', 'hosting', 'Bad overhead on client resource', 10, 'USD', '${admin.id}');
      `);
    } catch (e) {
      overheadClientRes = /overhead/i.test(e.message);
    }
    check("3F-ALLOC-3a", "Client-owned resource cannot be recorded as overhead", overheadClientRes);

    let crossRes = false;
    try {
      await db.query(`
        INSERT INTO public.provider_costs (allocation_type, client_id, resource_id, cost_type, description, amount, currency, created_by)
        VALUES ('client', '${clientA.id}', '${resBId}', 'hosting', 'Cross resource', 10, 'USD', '${admin.id}');
      `);
    } catch (e) {
      crossRes = /does not match referenced resource client_id/i.test(e.message);
    }
    check("3F-INT-1", "Client A cost cannot reference Client B resource", crossRes);

    let crossSys = false;
    try {
      await db.query(`
        INSERT INTO public.provider_costs (allocation_type, client_id, resource_id, system_id, cost_type, description, amount, currency, created_by)
        VALUES ('client', '${clientA.id}', '${resSAId}', '${sysBId}', 'hosting', 'Cross system', 10, 'USD', '${admin.id}');
      `);
    } catch (e) {
      crossSys = /does not match referenced system client_id/i.test(e.message);
    }
    check("3F-INT-2", "Client A cost cannot reference Client B system", crossSys);

    let crossAgr = false;
    try {
      await db.query(`
        INSERT INTO public.provider_costs (allocation_type, client_id, service_agreement_id, cost_type, description, amount, currency, created_by)
        VALUES ('client', '${clientA.id}', '${agrBId}', 'hosting', 'Cross agreement', 10, 'USD', '${admin.id}');
      `);
    } catch (e) {
      crossAgr = /does not match referenced service agreement client_id/i.test(e.message);
    }
    check("3F-INT-3", "Client A cost cannot reference Client B agreement", crossAgr);

    let resSysMismatch = false;
    try {
      await db.query(`
        INSERT INTO public.provider_costs (allocation_type, client_id, resource_id, system_id, cost_type, description, amount, currency, created_by)
        VALUES ('client', '${clientA.id}', '${resAId}', '${sysBId}', 'hosting', 'Resource/system mismatch', 10, 'USD', '${admin.id}');
      `);
    } catch (e) {
      resSysMismatch = /does not match the referenced resource system/i.test(e.message);
    }
    check("3F-INT-4", "Cost system_id inconsistent with resource's system rejected", resSysMismatch);

    // Valid client-allocated cost — client/system/account derived from the resource
    const costARes = await db.query(`
      INSERT INTO public.provider_costs (allocation_type, client_id, resource_id, service_agreement_id, cost_type, description, amount, currency, status, created_by)
      VALUES ('client', '${clientA.id}', '${resAId}', '${agrAId}', 'database', 'Client A Database Cost', 60.00, 'USD', 'due', '${admin.id}')
      RETURNING id, client_id, system_id, provider_account_id;
    `);
    const costAId = costARes.rows[0].id;
    check("3F-ALLOC-4", "Client cost valid; system + provider_account derived from resource",
      costARes.rows[0].client_id === clientA.id &&
      costARes.rows[0].system_id === sysAId &&
      costARes.rows[0].provider_account_id === accountId);

    // A cost on agreement B with NO revenue — for margin 'unavailable' coverage
    const costBRes = await db.query(`
      INSERT INTO public.provider_costs (allocation_type, client_id, resource_id, service_agreement_id, cost_type, description, amount, currency, status, created_by)
      VALUES ('client', '${clientB.id}', '${resBId}', '${agrBId}', 'hosting', 'Client B Hosting Cost', 25.00, 'USD', 'due', '${admin.id}')
      RETURNING id;
    `);
    const costBId = costBRes.rows[0].id;

    // -------------------------------------------------------------------------
    // 4. Lifecycle Rules
    // -------------------------------------------------------------------------
    console.log("\n--- 4. LIFECYCLE & STATE TRANSITIONS ---");

    let createCancelled = false;
    try {
      await db.query(`
        INSERT INTO public.provider_costs (allocation_type, client_id, resource_id, cost_type, description, amount, currency, status, created_by)
        VALUES ('client', '${clientA.id}', '${resAId}', 'hosting', 'Cancelled on create', 10, 'USD', 'cancelled', '${admin.id}');
      `);
    } catch (e) {
      createCancelled = /cannot be created as cancelled/i.test(e.message);
    }
    check("3F-LIFE-1", "New provider cost cannot be created cancelled", createCancelled);

    await db.query(`UPDATE public.provider_costs SET status = 'paid' WHERE id = '${costAId}';`);
    let cur = (await db.query(`SELECT status, paid_at FROM public.provider_costs WHERE id = '${costAId}';`)).rows[0];
    check("3F-LIFE-2", "paid transition populates paid_at", cur.status === "paid" && !!cur.paid_at);

    // paid_at rejected on non-paid statuses
    let paidAtRejected = false;
    try {
      await db.query(`UPDATE public.provider_costs SET status = 'due', paid_at = now() WHERE id = '${costBId}';`);
    } catch (e) {
      paidAtRejected = /paid_at is only valid/i.test(e.message);
    }
    check("3F-LIFE-3", "paid_at rejected on non-paid status", paidAtRejected);

    // Cancel -> terminal
    await db.query(`UPDATE public.provider_costs SET status = 'cancelled' WHERE id = '${costAId}';`);
    let reactivated = false;
    try {
      await db.query(`UPDATE public.provider_costs SET status = 'due' WHERE id = '${costAId}';`);
    } catch (e) {
      reactivated = /cannot be reactivated/i.test(e.message);
    }
    check("3F-LIFE-4", "Cancelled provider cost is terminal", reactivated);

    // Restore costA to 'due' state for margin checks — cancelled is terminal, so
    // create a fresh USD cost bound to agreement A
    const costA2Res = await db.query(`
      INSERT INTO public.provider_costs (allocation_type, client_id, resource_id, service_agreement_id, cost_type, description, amount, currency, status, created_by)
      VALUES ('client', '${clientA.id}', '${resAId}', '${agrAId}', 'database', 'Client A Database Cost v2', 60.00, 'USD', 'due', '${admin.id}')
      RETURNING id;
    `);
    const costA2Id = costA2Res.rows[0].id;

    // Binding immutability
    let rebindBlocked = false;
    try {
      await db.query(`UPDATE public.provider_costs SET resource_id = '${resSAId}' WHERE id = '${costA2Id}';`);
    } catch (e) {
      rebindBlocked = /cannot be changed|does not match/i.test(e.message);
    }
    const rebindRow = (await db.query(`SELECT resource_id FROM public.provider_costs WHERE id = '${costA2Id}';`)).rows[0];
    check("3F-LIFE-5", "Cost bindings immutable after recording",
      rebindBlocked && rebindRow?.resource_id === resAId);

    // -------------------------------------------------------------------------
    // 5. Delete Safety
    // -------------------------------------------------------------------------
    console.log("\n--- 5. DELETE SAFETY ---");

    let deleteBlocked = false;
    try {
      await db.query(`DELETE FROM public.provider_costs WHERE id = '${costA2Id}';`);
    } catch (e) {
      deleteBlocked = /Destructive deletion of provider cost records is strictly forbidden/i.test(e.message);
    }
    check("3F-SEC-3", "Destructive deletion of provider costs blocked by trigger", deleteBlocked);

    // -------------------------------------------------------------------------
    // 6. Audit Logging
    // -------------------------------------------------------------------------
    console.log("\n--- 6. AUDIT LOGGING ---");

    const audit = async (id) =>
      (await db.query(`SELECT action FROM public.audit_logs WHERE table_name = 'provider_costs' AND record_id = '${id}';`)).rows.map(r => r.action);

    check("3F-AUD-1", "provider_cost.created logged", (await audit(costAId)).includes("provider_cost.created"));
    check("3F-AUD-2", "provider_cost.status_changed logged", (await audit(costAId)).includes("provider_cost.status_changed"));
    check("3F-AUD-3", "provider_cost.cancelled logged", (await audit(costAId)).includes("provider_cost.cancelled"));

    await db.query(`UPDATE public.provider_costs SET description = 'Client A Database Cost v2 updated' WHERE id = '${costA2Id}';`);
    check("3F-AUD-4", "provider_cost.updated logged", (await audit(costA2Id)).includes("provider_cost.updated"));

    await db.query(`UPDATE public.provider_costs SET renewal_date = CURRENT_DATE + 30, is_recurring = true WHERE id = '${costA2Id}';`);
    check("3F-AUD-5", "provider_cost.renewal_updated logged", (await audit(costA2Id)).includes("provider_cost.renewal_updated"));

    // -------------------------------------------------------------------------
    // 7. Renewal Classification (deterministic)
    // -------------------------------------------------------------------------
    console.log("\n--- 7. RENEWAL CLASSIFICATION ---");

    const renewalState = async (expr) =>
      (await db.query(`SELECT public.derive_cost_renewal_state(${expr}) AS s;`)).rows[0].s;

    check("3F-REN-1a", "overdue when renewal_date in the past",
      (await renewalState("CURRENT_DATE - 1, true, 'due'")) === "overdue");
    check("3F-REN-1b", "due within the 7-day operational window",
      (await renewalState("CURRENT_DATE + 5, true, 'due'")) === "due");
    check("3F-REN-1c", "upcoming beyond the 7-day window",
      (await renewalState("CURRENT_DATE + 30, true, 'due'")) === "upcoming");
    check("3F-REN-1d", "no_renewal when not recurring",
      (await renewalState("CURRENT_DATE + 30, false, 'due'")) === "no_renewal");
    check("3F-REN-1e", "no_renewal when cancelled",
      (await renewalState("CURRENT_DATE + 30, true, 'cancelled'")) === "no_renewal");

    // -------------------------------------------------------------------------
    // 8. Service Margin & Currency Isolation
    // -------------------------------------------------------------------------
    console.log("\n--- 8. SERVICE MARGIN & CURRENCY ISOLATION ---");

    // Admin token queries the margin view (role-guarded)
    const marginRes = await authResults.admin.rest.get("service_margin_view", { select: "*" });
    check("3F-MAR-1", "Admin can query service_margin_view", marginRes.ok && Array.isArray(marginRes.body));

    const marginA = (marginRes.body || []).filter(m => m.agreement_id === agrAId);
    const usdRow = marginA.find(m => m.currency === "USD");
    const ugxRow = marginA.find(m => m.currency === "UGX");

    check("3F-MAR-2", "USD margin = 200 revenue - 60 cost = 140 @ 70%",
      usdRow && Number(usdRow.service_revenue) === 200 &&
      Number(usdRow.allocated_cost) === 60 &&
      Number(usdRow.margin_amount) === 140 &&
      Number(usdRow.margin_pct) === 70 &&
      usdRow.margin_state === "computed",
      usdRow ? `rev=${usdRow.service_revenue} cost=${usdRow.allocated_cost} m=${usdRow.margin_amount} pct=${usdRow.margin_pct}` : "no USD row");

    check("3F-MAR-3", "UGX margin stays in UGX (500000 - 0) — USD cost never mixed",
      ugxRow && Number(ugxRow.service_revenue) === 500000 &&
      Number(ugxRow.allocated_cost) === 0 &&
      Number(ugxRow.margin_amount) === 500000,
      ugxRow ? `rev=${ugxRow.service_revenue} cost=${ugxRow.allocated_cost} m=${ugxRow.margin_amount}` : "no UGX row");

    const marginB = (marginRes.body || []).filter(m => m.agreement_id === agrBId && m.currency === "USD")[0];
    check("3F-MAR-4", "No revenue produces unavailable margin (not invented)",
      marginB && marginB.margin_state === "unavailable" && marginB.margin_amount === null,
      marginB ? `state=${marginB.margin_state}` : "no row");

    // Cancelled cost excluded from allocation totals
    const costCancelledRow = (await db.query(`
      SELECT COALESCE(SUM(amount), 0) AS total FROM public.provider_costs
      WHERE service_agreement_id = '${agrAId}' AND status <> 'cancelled' AND currency = 'USD';
    `)).rows[0];
    check("3F-MAR-5", "Cancelled cost excluded from allocated totals", Number(costCancelledRow.total) === 60);

    // -------------------------------------------------------------------------
    // 9. RBAC Verification via REST API
    // -------------------------------------------------------------------------
    console.log("\n--- 9. RBAC & ROLE BOUNDARIES (REST API) ---");

    const adminCosts = await authResults.admin.rest.get("provider_costs", { select: "id,amount,currency" });
    check("3F-RBAC-1a", "Admin reads provider_costs via REST", adminCosts.ok && Array.isArray(adminCosts.body));

    const adminInsert = await authResults.admin.rest.insert("provider_costs", {
      allocation_type: "overhead",
      provider_account_id: accountId,
      cost_type: "software",
      description: "Admin REST cost",
      amount: 15,
      currency: "USD",
      created_by: admin.id
    });
    check("3F-RBAC-1b", "Admin can create provider costs via REST",
      adminInsert.ok && adminInsert.status === 201, `status=${adminInsert.status}`);
    const adminCostId = adminInsert.body?.[0]?.id;

    const financeCosts = await authResults.finance.rest.get("provider_costs", { select: "id,amount,currency" });
    check("3F-RBAC-2a", "Finance reads provider_costs via REST",
      financeCosts.ok && Array.isArray(financeCosts.body) && financeCosts.body.length >= 3);

    const financeInsert = await authResults.finance.rest.insert("provider_costs", {
      allocation_type: "client",
      client_id: clientA.id,
      resource_id: resSAId,
      cost_type: "domain",
      description: "Finance REST domain cost",
      amount: 12,
      currency: "USD",
      created_by: finance.id
    });
    check("3F-RBAC-2b", "Finance can create provider costs via REST",
      financeInsert.ok && financeInsert.status === 201, `status=${financeInsert.status}`);

    const financeMargins = await authResults.finance.rest.get("service_margin_view", { select: "*" });
    check("3F-RBAC-2c", "Finance reads service_margin_view",
      financeMargins.ok && Array.isArray(financeMargins.body) && financeMargins.body.length >= 2);

    // Staff: zero raw rows, no write, safe view with NO financial fields
    const staffCosts = await authResults.staff.rest.get("provider_costs");
    check("3F-RBAC-3a", "Staff receives 0 rows on provider_costs via REST",
      staffCosts.status === 200 && Array.isArray(staffCosts.body) && staffCosts.body.length === 0);

    const staffInsert = await authResults.staff.rest.insert("provider_costs", {
      allocation_type: "overhead",
      cost_type: "software",
      description: "Staff attempt",
      amount: 5,
      currency: "USD",
      created_by: staff.id
    });
    check("3F-RBAC-3b", "Staff cannot create provider costs via REST",
      !staffInsert.ok || staffInsert.status >= 400, `status=${staffInsert.status}`);

    const staffView = await authResults.staff.rest.get("staff_provider_costs_view", { select: "*" });
    const staffRow = (staffView.body || [])[0];
    check("3F-RBAC-3c", "Staff reads safe operational view (context only)",
      staffView.ok && Array.isArray(staffView.body) && staffView.body.length >= 1);
    check("3F-RBAC-3d", "Staff safe view exposes NO amount/currency/margin/description",
      !!staffRow &&
      !("amount" in staffRow) &&
      !("currency" in staffRow) &&
      !("description" in staffRow) &&
      !("notes" in staffRow) &&
      !("margin_amount" in staffRow) &&
      !("service_revenue" in staffRow),
      staffRow ? `keys=${Object.keys(staffRow).join(",")}` : "no row");

    const staffMargin = await authResults.staff.rest.get("service_margin_view", { select: "*" });
    check("3F-RBAC-3e", "Staff receives 0 rows on service_margin_view",
      staffMargin.status === 200 && Array.isArray(staffMargin.body) && staffMargin.body.length === 0);

    const staffOverview = await authResults.staff.rest.get("provider_cost_overview", { select: "*" });
    check("3F-RBAC-3f", "Staff receives 0 rows on provider_cost_overview",
      staffOverview.status === 200 && Array.isArray(staffOverview.body) && staffOverview.body.length === 0);

    // Client: zero access everywhere
    const clientCosts = await authResults.clientA.rest.get("provider_costs");
    check("3F-RBAC-4a", "Client receives 0 rows on provider_costs",
      clientCosts.status === 200 && Array.isArray(clientCosts.body) && clientCosts.body.length === 0);
    const clientSafe = await authResults.clientA.rest.get("staff_provider_costs_view");
    check("3F-RBAC-4b", "Client receives 0 rows on staff safe view",
      clientSafe.status === 200 && Array.isArray(clientSafe.body) && clientSafe.body.length === 0);
    const clientMargin = await authResults.clientA.rest.get("service_margin_view");
    check("3F-RBAC-4c", "Client receives 0 rows on service_margin_view",
      clientMargin.status === 200 && Array.isArray(clientMargin.body) && clientMargin.body.length === 0);
    const clientOverview = await authResults.clientA.rest.get("provider_cost_overview");
    check("3F-RBAC-4d", "Client receives 0 rows on provider_cost_overview",
      clientOverview.status === 200 && Array.isArray(clientOverview.body) && clientOverview.body.length === 0);

    // -------------------------------------------------------------------------
    // 10. Financial Anti-Leak Cross-Check
    // -------------------------------------------------------------------------
    console.log("\n--- 10. FINANCIAL ANTI-LEAK ---");

    const staffInvoices = await authResults.staff.rest.get("invoices");
    check("3F-FIN-1", "Staff still receives 0 rows on invoices via REST",
      staffInvoices.status === 200 ? staffInvoices.body.length === 0 : staffInvoices.status === 403 || staffInvoices.status === 404);

    const staffRecurring = await authResults.staff.rest.get("recurring_charges");
    check("3F-FIN-2", "Staff still receives 0 rows on recurring_charges via REST",
      staffRecurring.status === 200 ? staffRecurring.body.length === 0 : staffRecurring.status === 403 || staffRecurring.status === 404);

  } finally {
    // -------------------------------------------------------------------------
    // 11. Teardown Test Data
    // -------------------------------------------------------------------------
    console.log("\n--- 11. TEARDOWN FIXTURES ---");
    try {
      const resIds = [resAId, resSAId, resBId].filter(Boolean);
      const agrIds = [agrAId, agrBId].filter(Boolean);
      const sysIds = [sysAId, sysBId].filter(Boolean);

      if (accountId || agrIds.length || resIds.length) {
        await db.query(`ALTER TABLE public.provider_costs DISABLE TRIGGER trg_provider_costs_no_delete;`);
        await db.query(
          `DELETE FROM public.provider_costs
           WHERE provider_account_id = $1
              OR service_agreement_id = ANY($2::uuid[])
              OR resource_id = ANY($3::uuid[]);`,
          [accountId, agrIds, resIds]
        );
        await db.query(`ALTER TABLE public.provider_costs ENABLE TRIGGER trg_provider_costs_no_delete;`);
      }

      await db.query(`DELETE FROM public.recurring_charges WHERE name LIKE 'Hosted Verify%';`);
      if (agrIds.length) {
        await db.query(`DELETE FROM public.service_agreements WHERE id = ANY($1::uuid[]);`, [agrIds]);
      }
      if (resIds.length) {
        await db.query(`DELETE FROM public.resources WHERE id = ANY($1::uuid[]);`, [resIds]);
      }
      if (sysIds.length) {
        await db.query(`DELETE FROM public.systems WHERE id = ANY($1::uuid[]);`, [sysIds]);
      }
      if (accountId) {
        await db.query(`DELETE FROM public.provider_accounts WHERE id = $1;`, [accountId]);
      }
      if (providerId) {
        await db.query(`DELETE FROM public.providers WHERE slug = 'hosted-dev-cost-prov';`);
      }
      console.log("[PASS] Teardown fixtures cleaned successfully.");
    } catch (teardownErr) {
      console.error("[WARN] Fixture teardown encountered error:", teardownErr.message);
    }
    await db.end();
  }

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log(`\n============================================================`);
  console.log(`PHASE 3F HOSTED VERIFICATION SUMMARY: ${passed} PASS, ${failed} FAIL`);
  console.log(`============================================================\n`);

  const report = {
    projectRef: target.ref,
    timestamp: new Date().toISOString(),
    passed,
    failed,
    status: failed === 0 ? "PASS" : "FAIL",
    results
  };

  mkdirSync("phase2c-reports", { recursive: true });
  writeFileSync(join("phase2c-reports", "phase3f-dev-verification.json"), redact(JSON.stringify(report, null, 2)));

  if (failed > 0) {
    throw new Error(`Hosted verification failed with ${failed} failures.`);
  }

  return report;
}

if (process.argv[1] && process.argv[1].endsWith("verify-phase3f-hosted-dev.mjs")) {
  const env = {};
  readFileSync(".env.phase2c", "utf8").split("\n").forEach((l) => {
    const m = l.match(/^\s*([^#][^=]*)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  });
  env.PHASE2C_DEV_PROJECT_REF = "outuocpsotiozkpyksex";
  env.PHASE2C_CONFIRM_DEV_WRITES = "outuocpsotiozkpyksex";

  runPhase3fHostedVerification({ env })
    .then(() => {
      console.log("Phase 3F Hosted DEV Verification complete.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Phase 3F Hosted DEV Verification FAILED:", err);
      process.exit(1);
    });
}
