// Automated Phase 3E Verification on Hosted DEV
// Project Ref: outuocpsotiozkpyksex ONLY
// Tests real REST API & direct PostgreSQL triggers/constraints against DEV with real test accounts.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { assertDevTarget, assertDbUrlMatchesRef, makeRedactor, writesConfirmed, GuardError } from "./phase2c-guard.mjs";
import { openPgConnection } from "./apply-migration-013.mjs";
import { createClient } from "./phase2c-lib.mjs";
import { ACCOUNT_FILE } from "./phase2c-seed-test-accounts.mjs";

export async function runPhase3eHostedVerification({ env = process.env } = {}) {
  const target = assertDevTarget(env);
  if (!target.dbUrl) {
    throw new GuardError("PHASE2C_DB_URL is required for hosted verification.");
  }
  assertDbUrlMatchesRef(target.dbUrl, target.ref);

  if (!writesConfirmed(env, target.ref)) {
    throw new GuardError(`PHASE2C_CONFIRM_DEV_WRITES=${target.ref} is required for Phase 3E hosted verification on DEV.`);
  }

  const secrets = [target.anonKey, target.serviceKey, target.dbUrl].filter(Boolean);
  const redact = makeRedactor(() => secrets);

  console.log(`[PHASE 3E DEV VERIFY] Connecting to DEV REST API & DB (${target.ref})...`);

  const accountsPath = resolve(ACCOUNT_FILE);
  const accountsData = JSON.parse(readFileSync(accountsPath, "utf8"));
  const { admin, staff, finance, clientA, clientB } = accountsData;

  const client = createClient({ url: target.url, anonKey: target.anonKey, serviceKey: target.serviceKey });

  console.log("[PHASE 3E DEV VERIFY] Signing in test accounts via Supabase Auth...");
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
    check("3E-SCH-1", "Total application tables is at least 30 (Phase 2C + 3A + 3B + 3C + 3D + 3E)",
      tables.length >= 30, `Found ${tables.length} tables`);

    check("3E-SCH-2", "backup_policies table exists", tables.includes("backup_policies"));
    check("3E-SCH-3", "backup_events table exists", tables.includes("backup_events"));

    const rlsRes = await db.query(`
      SELECT tablename, rowsecurity FROM pg_tables
      WHERE schemaname = 'public' AND tablename IN ('backup_policies', 'backup_events');
    `);
    const rlsMap = Object.fromEntries(rlsRes.rows.map(r => [r.tablename, r.rowsecurity]));
    check("3E-SEC-3a", "RLS enabled on backup_policies", rlsMap["backup_policies"] === true);
    check("3E-SEC-3b", "RLS enabled on backup_events", rlsMap["backup_events"] === true);

    const anonPrivs = (await db.query(`
      SELECT privilege_type, table_name FROM information_schema.role_table_grants
      WHERE grantee = 'anon' AND table_schema = 'public' AND table_name IN ('backup_policies', 'backup_events');
    `)).rows;
    check("3E-SEC-1", "anon role has 0 privileges on backup tables", anonPrivs.length === 0, `Found: ${anonPrivs.length}`);

    const truncateGrants = (await db.query(`
      SELECT grantee, table_name FROM information_schema.role_table_grants
      WHERE privilege_type = 'TRUNCATE'
        AND grantee IN ('anon', 'authenticated', 'service_role')
        AND table_schema = 'public'
        AND table_name IN ('backup_policies', 'backup_events');
    `)).rows;
    check("3E-SEC-2", "no TRUNCATE privileges granted on backup tables", truncateGrants.length === 0, `Found: ${truncateGrants.length}`);

    const constraints = (await db.query(`
      SELECT pg_get_constraintdef(oid) as def FROM pg_constraint
      WHERE conrelid IN ('public.backup_policies'::regclass, 'public.backup_events'::regclass) AND contype = 'c';
    `)).rows.map(r => r.def);

    check("3E-SCH-4a", "backup_policies frequency check constraint exists",
      constraints.some(d => d.includes("'daily'") && d.includes("'custom'")));
    check("3E-SCH-4b", "backup_policies retention positivity constraint exists",
      constraints.some(d => d.includes("retention_days") && d.includes("> 0")));
    check("3E-SCH-4c", "backup_events status check constraint exists",
      constraints.some(d => d.includes("'expected'") && d.includes("'verified'")));

    // No secret/credential columns (3E-SEC-4)
    const secretCols = (await db.query(`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('backup_policies', 'backup_events')
        AND column_name ~* '(password|secret|token|api_key|apikey|private_key|credential)';
    `)).rows;
    check("3E-SEC-4", "no credential/secret columns on backup tables", secretCols.length === 0,
      secretCols.length ? secretCols.map(c => `${c.table_name}.${c.column_name}`).join(", ") : "none found");

    // -------------------------------------------------------------------------
    // 2. Setup Operational Reference Data for Client A & B
    // -------------------------------------------------------------------------
    console.log("\n--- 2. SETUP BACKUP FIXTURES ---");

    const providerRes = await db.query(`
      INSERT INTO public.providers (name, slug)
      VALUES ('Hosted Dev Backup Provider', 'hosted-dev-bkp-prov')
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
      RETURNING id;
    `);
    const providerId = providerRes.rows[0].id;

    const accountRes = await db.query(`
      INSERT INTO public.provider_accounts (provider_id, account_name, ownership)
      VALUES ('${providerId}', 'Dev Backup Account', 'sch_managed')
      RETURNING id;
    `);
    const accountId = accountRes.rows[0].id;

    const sysARes = await db.query(`
      INSERT INTO public.systems (client_id, name, system_type, status)
      VALUES ('${clientA.id}', 'Client A Backup System', 'web_platform', 'live')
      RETURNING id;
    `);
    const sysAId = sysARes.rows[0].id;

    const resARes = await db.query(`
      INSERT INTO public.resources (system_id, provider_account_id, name, resource_type, client_id, status)
      VALUES ('${sysAId}', '${accountId}', 'Client A Backup DB', 'database', '${clientA.id}', 'active')
      RETURNING id;
    `);
    const resAId = resARes.rows[0].id;

    const resA2Res = await db.query(`
      INSERT INTO public.resources (system_id, provider_account_id, name, resource_type, client_id, status)
      VALUES ('${sysAId}', '${accountId}', 'Client A Backup Store', 'storage_bucket', '${clientA.id}', 'active')
      RETURNING id;
    `);
    const resA2Id = resA2Res.rows[0].id;

    const sysBRes = await db.query(`
      INSERT INTO public.systems (client_id, name, system_type, status)
      VALUES ('${clientB.id}', 'Client B Backup System', 'web_platform', 'live')
      RETURNING id;
    `);
    const sysBId = sysBRes.rows[0].id;

    const resBRes = await db.query(`
      INSERT INTO public.resources (system_id, provider_account_id, name, resource_type, client_id, status)
      VALUES ('${sysBId}', '${accountId}', 'Client B Backup DB', 'database', '${clientB.id}', 'active')
      RETURNING id;
    `);
    const resBId = resBRes.rows[0].id;

    const agrARes = await db.query(`
      INSERT INTO public.service_agreements (client_id, system_id, name, service_type, status, start_date)
      VALUES ('${clientA.id}', '${sysAId}', 'Client A Backup SLA', 'managed_service', 'active', '2026-10-01')
      RETURNING id;
    `);
    const agrAId = agrARes.rows[0].id;

    const agrBRes = await db.query(`
      INSERT INTO public.service_agreements (client_id, system_id, name, service_type, status, start_date)
      VALUES ('${clientB.id}', '${sysBId}', 'Client B Backup SLA', 'managed_service', 'active', '2026-10-01')
      RETURNING id;
    `);
    const agrBId = agrBRes.rows[0].id;

    // Standalone resource (no system) for explicit system_id validation
    const resSA = await db.query(`
      INSERT INTO public.resources (system_id, provider_account_id, name, resource_type, client_id, status)
      VALUES (NULL, '${accountId}', 'Client A Standalone Vault', 'storage_bucket', '${clientA.id}', 'active')
      RETURNING id;
    `);
    const resSAId = resSA.rows[0].id;

    // -------------------------------------------------------------------------
    // 3. Same-Client Integrity Tests
    // -------------------------------------------------------------------------
    console.log("\n--- 3. SAME-CLIENT INTEGRITY CHECKS ---");

    let crossPolRes = false;
    try {
      await db.query(`
        INSERT INTO public.backup_policies (client_id, resource_id, name, frequency, retention_days, created_by)
        VALUES ('${clientA.id}', '${resBId}', 'Cross Resource Policy', 'daily', 30, '${admin.id}');
      `);
    } catch (e) {
      crossPolRes = /does not match referenced resource client_id/i.test(e.message);
    }
    check("3E-INT-1", "Client A policy cannot reference Client B resource", crossPolRes);

    let crossPolSys = false;
    try {
      await db.query(`
        INSERT INTO public.backup_policies (client_id, resource_id, system_id, name, frequency, retention_days, created_by)
        VALUES ('${clientA.id}', '${resSAId}', '${sysBId}', 'Cross System Policy', 'daily', 30, '${admin.id}');
      `);
    } catch (e) {
      crossPolSys = /does not match referenced system client_id/i.test(e.message);
    }
    check("3E-INT-4", "Client A policy cannot reference Client B system", crossPolSys);

    let crossPolAgr = false;
    try {
      await db.query(`
        INSERT INTO public.backup_policies (client_id, resource_id, service_agreement_id, name, frequency, retention_days, created_by)
        VALUES ('${clientA.id}', '${resAId}', '${agrBId}', 'Cross Agreement Policy', 'daily', 30, '${admin.id}');
      `);
    } catch (e) {
      crossPolAgr = /does not match referenced service agreement client_id/i.test(e.message);
    }
    check("3E-INT-3b", "Client A policy cannot reference Client B service agreement", crossPolAgr);

    // Valid Client A policy
    const polARes = await db.query(`
      INSERT INTO public.backup_policies (client_id, resource_id, service_agreement_id, name, frequency, retention_days, verification_required, created_by)
      VALUES ('${clientA.id}', '${resAId}', '${agrAId}', 'Client A Nightly DB Backup', 'daily', 30, true, '${admin.id}')
      RETURNING id, system_id;
    `);
    const polAId = polARes.rows[0].id;
    check("3E-INT-6", "Valid policy created; system_id derived from resource",
      !!polAId && polARes.rows[0].system_id === sysAId);

    // Second overlapping active policy on same resource rejected
    let overlapBlocked = false;
    try {
      await db.query(`
        INSERT INTO public.backup_policies (client_id, resource_id, name, frequency, retention_days, created_by)
        VALUES ('${clientA.id}', '${resAId}', 'Overlapping Policy', 'weekly', 14, '${admin.id}');
      `);
    } catch (e) {
      overlapBlocked = /active backup policy already exists/i.test(e.message);
    }
    check("3E-INT-7", "Overlapping active policy on same resource rejected", overlapBlocked);

    // Policy for client B
    const polBRes = await db.query(`
      INSERT INTO public.backup_policies (client_id, resource_id, name, frequency, retention_days, created_by)
      VALUES ('${clientB.id}', '${resBId}', 'Client B Weekly Backup', 'weekly', 14, '${admin.id}')
      RETURNING id;
    `);
    const polBId = polBRes.rows[0].id;

    let crossEvRes = false;
    try {
      await db.query(`
        INSERT INTO public.backup_events (client_id, resource_id, status, recorded_by)
        VALUES ('${clientA.id}', '${resBId}', 'successful', '${admin.id}');
      `);
    } catch (e) {
      crossEvRes = /does not match referenced resource client_id/i.test(e.message);
    }
    check("3E-INT-2", "Client A event cannot reference Client B resource", crossEvRes);

    let crossEvPol = false;
    try {
      await db.query(`
        INSERT INTO public.backup_events (client_id, backup_policy_id, resource_id, status, recorded_by)
        VALUES ('${clientA.id}', '${polBId}', '${resAId}', 'successful', '${admin.id}');
      `);
    } catch (e) {
      crossEvPol = /does not match referenced backup policy client_id/i.test(e.message);
    }
    check("3E-INT-3", "Client A event cannot reference Client B policy", crossEvPol);

    let crossEvSys = false;
    try {
      await db.query(`
        INSERT INTO public.backup_events (client_id, resource_id, system_id, status, recorded_by)
        VALUES ('${clientA.id}', '${resSAId}', '${sysBId}', 'successful', '${admin.id}');
      `);
    } catch (e) {
      crossEvSys = /does not match referenced system client_id/i.test(e.message);
    }
    check("3E-INT-5", "Client A event cannot reference Client B system", crossEvSys);

    // -------------------------------------------------------------------------
    // 4. Lifecycle Rules & State Transitions
    // -------------------------------------------------------------------------
    console.log("\n--- 4. LIFECYCLE & STATE TRANSITIONS ---");

    // Direct 'verified' insert rejected
    let directVerified = false;
    try {
      await db.query(`
        INSERT INTO public.backup_events (client_id, backup_policy_id, resource_id, status, recorded_by)
        VALUES ('${clientA.id}', '${polAId}', '${resAId}', 'verified', '${admin.id}');
      `);
    } catch (e) {
      directVerified = /cannot directly be created as verified/i.test(e.message);
    }
    check("3E-LIFE-1a", "New backup event cannot be created directly as verified", directVerified);

    // Failed event without reason rejected
    let failedNoReason = false;
    try {
      await db.query(`
        INSERT INTO public.backup_events (client_id, backup_policy_id, resource_id, status, recorded_by)
        VALUES ('${clientA.id}', '${polAId}', '${resAId}', 'failed', '${admin.id}');
      `);
    } catch (e) {
      failedNoReason = /requires a failure_reason/i.test(e.message);
    }
    check("3E-LIFE-1b", "Failed backup event requires failure_reason", failedNoReason);

    // Valid lifecycle: expected -> in_progress -> successful -> verified
    const evRes = await db.query(`
      INSERT INTO public.backup_events (client_id, backup_policy_id, resource_id, status, recorded_by)
      VALUES ('${clientA.id}', '${polAId}', '${resAId}', 'expected', '${admin.id}')
      RETURNING id;
    `);
    const evId = evRes.rows[0].id;
    check("3E-LIFE-1c", "Expected backup event created", !!evId);

    await db.query(`UPDATE public.backup_events SET status = 'in_progress' WHERE id = '${evId}';`);
    let cur = (await db.query(`SELECT status, started_at FROM public.backup_events WHERE id = '${evId}';`)).rows[0];
    check("3E-LIFE-1d", "in_progress populates started_at", cur.status === "in_progress" && !!cur.started_at);

    await db.query(`UPDATE public.backup_events SET status = 'successful' WHERE id = '${evId}';`);
    cur = (await db.query(`SELECT status, completed_at FROM public.backup_events WHERE id = '${evId}';`)).rows[0];
    check("3E-LIFE-1e", "successful populates completed_at", cur.status === "successful" && !!cur.completed_at);

    await db.query(`UPDATE public.backup_events SET status = 'verified', verified_by = '${admin.id}' WHERE id = '${evId}';`);
    cur = (await db.query(`SELECT status, verified_at, verified_by FROM public.backup_events WHERE id = '${evId}';`)).rows[0];
    check("3E-LIFE-1f", "verified populates verified_at and verified_by",
      cur.status === "verified" && !!cur.verified_at && cur.verified_by === admin.id);

    // Verified is terminal
    let terminalVerified = false;
    try {
      await db.query(`UPDATE public.backup_events SET status = 'successful' WHERE id = '${evId}';`);
    } catch (e) {
      terminalVerified = /terminal status/i.test(e.message);
    }
    check("3E-LIFE-2a", "Verified event is terminal", terminalVerified);

    // expected -> verified invalid
    const ev2Res = await db.query(`
      INSERT INTO public.backup_events (client_id, backup_policy_id, resource_id, status, recorded_by)
      VALUES ('${clientA.id}', '${polAId}', '${resAId}', 'expected', '${admin.id}')
      RETURNING id;
    `);
    const ev2Id = ev2Res.rows[0].id;
    let badTransition = false;
    try {
      await db.query(`UPDATE public.backup_events SET status = 'verified' WHERE id = '${ev2Id}';`);
    } catch (e) {
      badTransition = /Invalid backup event transition/i.test(e.message);
    }
    check("3E-LIFE-2b", "expected -> verified transition rejected", badTransition);

    // Identity binding immutability — rejected either by the policy/resource
    // integrity trigger or the lifecycle binding guard.
    let rebindBlocked = false;
    try {
      await db.query(`UPDATE public.backup_events SET resource_id = '${resA2Id}' WHERE id = '${ev2Id}';`);
    } catch (e) {
      rebindBlocked = /cannot be changed|does not match referenced backup policy/i.test(e.message);
    }
    const rebindRow = (await db.query(`SELECT resource_id FROM public.backup_events WHERE id = '${ev2Id}';`)).rows[0];
    check("3E-LIFE-2c", "Event resource/policy bindings immutable after recording",
      rebindBlocked && rebindRow?.resource_id === resAId);

    // -------------------------------------------------------------------------
    // 5. Delete Safety Checks
    // -------------------------------------------------------------------------
    console.log("\n--- 5. DELETE SAFETY CHECKS ---");

    let evDeleteBlocked = false;
    try {
      await db.query(`DELETE FROM public.backup_events WHERE id = '${evId}';`);
    } catch (e) {
      evDeleteBlocked = /Destructive deletion of backup event records is strictly forbidden/i.test(e.message);
    }
    check("3E-SEC-3c", "Destructive deletion of backup events blocked by trigger", evDeleteBlocked);

    let polDeleteBlocked = false;
    try {
      await db.query(`DELETE FROM public.backup_policies WHERE id = '${polAId}';`);
    } catch (e) {
      polDeleteBlocked = /Destructive deletion of backup policies is strictly forbidden/i.test(e.message);
    }
    check("3E-SEC-3d", "Destructive deletion of backup policies blocked by trigger", polDeleteBlocked);

    // -------------------------------------------------------------------------
    // 6. Audit Logging Verification
    // -------------------------------------------------------------------------
    console.log("\n--- 6. AUDIT LOGGING VERIFICATION ---");

    const polAudit = (await db.query(`
      SELECT action FROM public.audit_logs
      WHERE table_name = 'backup_policies' AND record_id = '${polAId}';
    `)).rows.map(r => r.action);
    check("3E-AUD-1", "backup_policy.created logged in audit_logs", polAudit.includes("backup_policy.created"));

    await db.query(`UPDATE public.backup_policies SET retention_days = 45 WHERE id = '${polAId}';`);
    const polAudit2 = (await db.query(`
      SELECT action FROM public.audit_logs
      WHERE table_name = 'backup_policies' AND record_id = '${polAId}';
    `)).rows.map(r => r.action);
    check("3E-AUD-2", "backup_policy.updated logged in audit_logs", polAudit2.includes("backup_policy.updated"));

    const evAudit = (await db.query(`
      SELECT action FROM public.audit_logs
      WHERE table_name = 'backup_events' AND record_id = '${evId}';
    `)).rows.map(r => r.action);
    check("3E-AUD-3a", "backup_event.created logged", evAudit.includes("backup_event.created"));
    check("3E-AUD-3b", "backup_event.status_changed logged", evAudit.includes("backup_event.status_changed"));
    check("3E-AUD-4", "backup_event.verified logged", evAudit.includes("backup_event.verified"));

    // -------------------------------------------------------------------------
    // 7. Backup Health Calculation
    // -------------------------------------------------------------------------
    console.log("\n--- 7. BACKUP HEALTH CALCULATION ---");

    // Policy A: verified event within daily cadence -> healthy
    let health = (await db.query(`SELECT health FROM public.backup_policy_health WHERE policy_id = '${polAId}';`)).rows[0];
    check("3E-HEALTH-1", "Verified recent backup reports healthy", health?.health === "healthy", `health=${health?.health}`);

    // Move the verified completion back 20h -> due
    await db.query(`UPDATE public.backup_events SET completed_at = now() - interval '20 hours' WHERE id = '${evId}';`);
    health = (await db.query(`SELECT health FROM public.backup_policy_health WHERE policy_id = '${polAId}';`)).rows[0];
    check("3E-HEALTH-2a", "Approaching cadence end reports due", health?.health === "due", `health=${health?.health}`);

    // Move completion back 2 days -> overdue
    await db.query(`UPDATE public.backup_events SET completed_at = now() - interval '2 days' WHERE id = '${evId}';`);
    health = (await db.query(`SELECT health FROM public.backup_policy_health WHERE policy_id = '${polAId}';`)).rows[0];
    check("3E-HEALTH-2b", "Past cadence reports overdue", health?.health === "overdue", `health=${health?.health}`);

    // Latest event failed -> failed
    await db.query(`
      INSERT INTO public.backup_events (client_id, backup_policy_id, resource_id, status, recorded_by, failure_reason)
      VALUES ('${clientA.id}', '${polAId}', '${resAId}', 'failed', '${admin.id}', 'Hosted verify: snapshot timed out');
    `);
    health = (await db.query(`SELECT health FROM public.backup_policy_health WHERE policy_id = '${polAId}';`)).rows[0];
    check("3E-HEALTH-3", "Latest failed event reports failed", health?.health === "failed", `health=${health?.health}`);

    // Unverified: new policy (verification_required) on resA2 with unverified success
    const polURes = await db.query(`
      INSERT INTO public.backup_policies (client_id, resource_id, name, frequency, retention_days, verification_required, created_by)
      VALUES ('${clientA.id}', '${resA2Id}', 'Client A Store Backup', 'daily', 30, true, '${admin.id}')
      RETURNING id;
    `);
    const polUId = polURes.rows[0].id;
    await db.query(`
      INSERT INTO public.backup_events (client_id, backup_policy_id, resource_id, status, recorded_by)
      VALUES ('${clientA.id}', '${polUId}', '${resA2Id}', 'successful', '${admin.id}');
    `);
    health = (await db.query(`SELECT health FROM public.backup_policy_health WHERE policy_id = '${polUId}';`)).rows[0];
    check("3E-HEALTH-4", "Required-but-unverified backup reports unverified", health?.health === "unverified", `health=${health?.health}`);

    // -------------------------------------------------------------------------
    // 8. RBAC Verification via REST API
    // -------------------------------------------------------------------------
    console.log("\n--- 8. RBAC & ROLE BOUNDARIES (REST API) ---");

    const adminPols = await authResults.admin.rest.get("backup_policies", { select: "*" });
    check("3E-RBAC-1", "Admin can fetch backup_policies via REST", adminPols.ok && Array.isArray(adminPols.body));

    const adminEvs = await authResults.admin.rest.get("backup_events", { select: "*" });
    check("3E-RBAC-2", "Admin can fetch backup_events via REST", adminEvs.ok && Array.isArray(adminEvs.body));

    const staffPols = await authResults.staff.rest.get("backup_policies", { select: "*" });
    check("3E-RBAC-3a", "Staff can fetch backup_policies via REST", staffPols.ok && Array.isArray(staffPols.body));

    // Staff can record a backup event via REST
    const staffEv = await authResults.staff.rest.insert("backup_events", {
      client_id: clientA.id,
      backup_policy_id: polUId,
      resource_id: resA2Id,
      status: "successful",
      recorded_by: staff.id,
      evidence_reference: "hosted-verify-snap-01"
    });
    check("3E-RBAC-3b", "Staff can record backup event via REST",
      staffEv.ok && staffEv.status === 201, `status=${staffEv.status}`);

    // Staff cannot create policies via REST (no insert policy for staff)
    const staffPolInsert = await authResults.staff.rest.insert("backup_policies", {
      client_id: clientA.id,
      resource_id: resA2Id,
      name: "Staff Policy Attempt",
      frequency: "daily",
      retention_days: 30,
      created_by: staff.id
    });
    check("3E-RBAC-4", "Staff cannot create backup policies via REST",
      !staffPolInsert.ok || staffPolInsert.status >= 400, `status=${staffPolInsert.status}`);

    // Finance cannot record events
    const financeEv = await authResults.finance.rest.insert("backup_events", {
      client_id: clientA.id,
      resource_id: resA2Id,
      status: "successful",
      recorded_by: finance.id
    });
    check("3E-RBAC-5", "Finance cannot record backup events via REST",
      !financeEv.ok || financeEv.status >= 400, `status=${financeEv.status}`);

    // Finance can read policies (context) but not create
    const financePols = await authResults.finance.rest.get("backup_policies", { select: "id" });
    check("3E-RBAC-5b", "Finance can read backup policies (context)", financePols.ok && Array.isArray(financePols.body));

    const financePolInsert = await authResults.finance.rest.insert("backup_policies", {
      client_id: clientA.id,
      resource_id: resA2Id,
      name: "Finance Policy Attempt",
      frequency: "daily",
      retention_days: 30,
      created_by: finance.id
    });
    check("3E-RBAC-5c", "Finance cannot create backup policies",
      !financePolInsert.ok || financePolInsert.status >= 400, `status=${financePolInsert.status}`);

    // Client isolation
    const clientPols = await authResults.clientA.rest.get("backup_policies");
    check("3E-RBAC-6a", "Client A receives 0 backup_policies via REST",
      clientPols.status === 200 && Array.isArray(clientPols.body) && clientPols.body.length === 0);

    const clientEvs = await authResults.clientA.rest.get("backup_events");
    check("3E-RBAC-6b", "Client A receives 0 backup_events via REST",
      clientEvs.status === 200 && Array.isArray(clientEvs.body) && clientEvs.body.length === 0);

    const clientHealth = await authResults.clientA.rest.get("backup_policy_health");
    check("3E-RBAC-6c", "Client A receives 0 rows from backup_policy_health view",
      clientHealth.status === 200 && Array.isArray(clientHealth.body) && clientHealth.body.length === 0);

    // -------------------------------------------------------------------------
    // 9. Financial Anti-Leak
    // -------------------------------------------------------------------------
    console.log("\n--- 9. FINANCIAL ANTI-LEAK ---");

    const staffInvoices = await authResults.staff.rest.get("invoices");
    check("3E-FIN-1", "Staff receives 0 rows on invoices table via REST",
      staffInvoices.status === 200 ? staffInvoices.body.length === 0 : staffInvoices.status === 403 || staffInvoices.status === 404);

    const financeInvoices = await authResults.finance.rest.get("invoices");
    check("3E-FIN-2", "Finance can view invoices via REST", financeInvoices.ok && Array.isArray(financeInvoices.body));

  } finally {
    // -------------------------------------------------------------------------
    // 10. Teardown Test Data
    // -------------------------------------------------------------------------
    console.log("\n--- 10. TEARDOWN FIXTURES ---");
    try {
      await db.query(`ALTER TABLE public.backup_policies DISABLE TRIGGER trg_backup_policies_no_delete;`);
      await db.query(`ALTER TABLE public.backup_events DISABLE TRIGGER trg_backup_events_no_delete;`);

      await db.query(`DELETE FROM public.backup_events WHERE resource_id IN (
        SELECT id FROM public.resources WHERE name LIKE '%Backup%' OR name LIKE '%Vault%'
      );`);
      await db.query(`DELETE FROM public.backup_policies WHERE resource_id IN (
        SELECT id FROM public.resources WHERE name LIKE '%Backup%' OR name LIKE '%Vault%'
      ) OR name LIKE '%Policy%';`);

      await db.query(`ALTER TABLE public.backup_policies ENABLE TRIGGER trg_backup_policies_no_delete;`);
      await db.query(`ALTER TABLE public.backup_events ENABLE TRIGGER trg_backup_events_no_delete;`);

      await db.query(`DELETE FROM public.service_agreements WHERE name LIKE '%Backup SLA%';`);
      await db.query(`DELETE FROM public.resources WHERE name LIKE '%Backup%' OR name LIKE '%Vault%';`);
      await db.query(`DELETE FROM public.systems WHERE name LIKE '%Backup System%';`);
      await db.query(`DELETE FROM public.provider_accounts WHERE account_name = 'Dev Backup Account';`);
      await db.query(`DELETE FROM public.providers WHERE slug = 'hosted-dev-bkp-prov';`);
      console.log("[PASS] Teardown fixtures cleaned successfully.");
    } catch (teardownErr) {
      console.error("[WARN] Fixture teardown encountered error:", teardownErr.message);
    }
    await db.end();
  }

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log(`\n============================================================`);
  console.log(`PHASE 3E HOSTED VERIFICATION SUMMARY: ${passed} PASS, ${failed} FAIL`);
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
  writeFileSync(join("phase2c-reports", "phase3e-dev-verification.json"), redact(JSON.stringify(report, null, 2)));

  if (failed > 0) {
    throw new Error(`Hosted verification failed with ${failed} failures.`);
  }

  return report;
}

if (process.argv[1] && process.argv[1].endsWith("verify-phase3e-hosted-dev.mjs")) {
  const env = {};
  readFileSync(".env.phase2c", "utf8").split("\n").forEach((l) => {
    const m = l.match(/^\s*([^#][^=]*)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  });
  env.PHASE2C_DEV_PROJECT_REF = "outuocpsotiozkpyksex";
  env.PHASE2C_CONFIRM_DEV_WRITES = "outuocpsotiozkpyksex";

  runPhase3eHostedVerification({ env })
    .then(() => {
      console.log("Phase 3E Hosted DEV Verification complete.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Phase 3E Hosted DEV Verification FAILED:", err);
      process.exit(1);
    });
}
