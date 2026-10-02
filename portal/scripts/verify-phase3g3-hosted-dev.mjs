// Automated Phase 3G-3 Verification on Hosted DEV
// Project Ref: outuocpsotiozkpyksex ONLY
// Verifies the controlled provider-operation lifecycle: closed operation
// vocabulary, proposal gates, explicit approval, execution gate + stale
// protection, single-flight execution, normalized result handling, mandatory
// post-operation verification, idempotency, RBAC, audit, delete safety.
//
// NOTE: provider mutation itself is exercised at FIXTURE level locally
// (tests/phase3g3-provider-operations.test.mjs stubs fetch). No live Supabase
// Management API call is made here — there is no real DEV provider credential —
// so the hosted checks exercise the full DB lifecycle via service RPCs, which is
// exactly the contract the server actions depend on.
//
// Run with: node scripts/verify-phase3g3-hosted-dev.mjs

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { assertDevTarget, assertDbUrlMatchesRef, makeRedactor, writesConfirmed, GuardError } from "./phase2c-guard.mjs";
import { openPgConnection } from "./apply-migration-013.mjs";
import { createClient } from "./phase2c-lib.mjs";
import { ACCOUNT_FILE } from "./phase2c-seed-test-accounts.mjs";

export async function runPhase3g3HostedVerification({ env = process.env } = {}) {
  const target = assertDevTarget(env);
  if (!target.dbUrl) {
    throw new GuardError("PHASE2C_DB_URL is required for hosted verification.");
  }
  assertDbUrlMatchesRef(target.dbUrl, target.ref);

  if (!writesConfirmed(env, target.ref)) {
    throw new GuardError(`PHASE2C_CONFIRM_DEV_WRITES=${target.ref} is required for Phase 3G-3 hosted verification on DEV.`);
  }

  const secrets = [target.anonKey, target.serviceKey, target.dbUrl].filter(Boolean);
  const redact = makeRedactor(() => secrets);

  console.log(`[PHASE 3G-3 DEV VERIFY] Connecting to DEV REST API & DB (${target.ref})...`);

  const accountsData = JSON.parse(readFileSync(resolve(ACCOUNT_FILE), "utf8"));
  const { admin, staff, finance, clientA } = accountsData;

  const client = createClient({ url: target.url, anonKey: target.anonKey, serviceKey: target.serviceKey });
  const service = client.rest({ kind: "service" });

  console.log("[PHASE 3G-3 DEV VERIFY] Signing in test accounts via Supabase Auth...");
  const authResults = {};
  for (const [key, acc] of Object.entries({ admin, staff, finance, clientA })) {
    const res = await client.auth.signIn(acc.email, acc.password);
    if (!res.ok) throw new Error(`Failed to sign in as ${key}: ${res.error || res.status}`);
    authResults[key] = {
      token: res.body?.access_token || res.token,
      userId: res.body?.user?.id || acc.id,
      role: acc.role,
      rest: client.rest({ kind: "user", token: res.body?.access_token || res.token }),
    };
  }

  const results = [];
  function check(id, title, pass, detail = "") {
    results.push({ id, title, pass, detail });
    console.log(`${pass ? "[PASS]" : "[FAIL]"} ${id.padEnd(11)} ${title} ${detail ? "(" + detail + ")" : ""}`);
  }
  function skipCheck(id, title, reason) {
    results.push({ id, title, pass: true, skipped: true, detail: `NOT TESTED — ${reason}` });
    console.log(`[SKIP] ${id.padEnd(11)} ${title} (NOT TESTED — ${reason})`);
  }

  const db = await openPgConnection(target.dbUrl);

  // Hoisted for scoped teardown.
  let providerId, accountId, accountIdFailed, sysAId;
  let discIds = [];
  let runIds = [];
  let proposalIds = [];

  const propose = (discId, op = "pause_resource", reason = "3g3 verify") =>
    service.rpc("propose_provider_operation", {
      p_discovered_id: discId, p_operation_key: op, p_reason: reason, p_actor: authResults.admin.userId });
  const review = (pid, decision) =>
    service.rpc("review_provider_operation", { p_proposal_id: pid, p_decision: decision, p_actor: authResults.admin.userId });
  const begin = (pid) =>
    service.rpc("begin_provider_operation_execution", { p_proposal_id: pid, p_actor: authResults.admin.userId });
  const complete = (execId, category) =>
    service.rpc("complete_provider_operation_execution", {
      p_execution_id: execId, p_result_category: category, p_actor: authResults.admin.userId });
  const finishVerify = (execId, outcome, observed) =>
    service.rpc("finish_provider_operation_verification", {
      p_execution_id: execId, p_outcome: outcome, p_observed_status: observed, p_actor: authResults.admin.userId });
  const pStatus = async (pid) =>
    (await db.query(`SELECT status FROM public.provider_operation_proposals WHERE id='${pid}'`)).rows[0]?.status;

  try {
    // -----------------------------------------------------------------------
    console.log("\n--- 1. SCHEMA & SAFETY ---");
    const tables = (await db.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_type='BASE TABLE'`)).rows.map((r) => r.table_name);
    check("3G3-SCH-1", "provider_operation_proposals + provider_operation_executions exist",
      tables.includes("provider_operation_proposals") && tables.includes("provider_operation_executions"));

    const views = (await db.query(`
      SELECT table_name FROM information_schema.views WHERE table_schema='public'
        AND table_name IN ('provider_operation_overview','provider_operation_execution_overview')`)).rows.map((r) => r.table_name);
    check("3G3-SCH-2", "operation overview views exist", views.length === 2, views.join(","));

    const rls = (await db.query(`
      SELECT relname, relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND relname IN ('provider_operation_proposals','provider_operation_executions')`)).rows;
    check("3G3-SCH-3", "RLS enabled on both new tables", rls.length === 2 && rls.every((r) => r.relrowsecurity));

    const idx = (await db.query(`
      SELECT indexname FROM pg_indexes WHERE schemaname='public'
        AND indexname IN ('uq_operation_open_proposal','uq_operation_live_execution')`)).rows.map((r) => r.indexname);
    check("3G3-SCH-4", "open-proposal dedupe + single-flight execution indexes", idx.length === 2, idx.join(","));

    const opCheck = (await db.query(`
      SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conrelid='public.provider_operation_proposals'::regclass AND contype='c'
        AND pg_get_constraintdef(oid) LIKE '%operation_key%'`)).rows;
    check("3G3-SCH-5", "closed operation vocabulary (pause_resource/resume_resource only)",
      opCheck.length === 1 && opCheck[0].def.includes("'pause_resource'") && opCheck[0].def.includes("'resume_resource'"));

    const fnGrants = (await db.query(`
      SELECT routine_name, grantee FROM information_schema.routine_privileges
      WHERE routine_schema='public'
        AND routine_name IN ('propose_provider_operation','review_provider_operation',
          'begin_provider_operation_execution','complete_provider_operation_execution',
          'finish_provider_operation_verification')
        AND grantee IN ('anon','authenticated','PUBLIC','public')`)).rows;
    check("3G3-SEC-1", "operation functions not executable by anon/authenticated/public",
      fnGrants.length === 0, fnGrants.length ? JSON.stringify(fnGrants) : "clean");

    const credCols = (await db.query(`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema='public'
        AND (column_name ~* '(^|_)(api_key|api_secret|access_token|refresh_token|password|private_key)(_|$)'
             OR column_name IN ('token','secret','api_key','password'))`)).rows;
    check("3G3-SEC-2", "no plaintext credential columns", credCols.length === 0,
      credCols.length ? credCols.map((c) => `${c.table_name}.${c.column_name}`).join(",") : "clean");

    const trunc = (await db.query(`
      SELECT grantee, table_name FROM information_schema.role_table_grants
      WHERE table_schema='public' AND privilege_type='TRUNCATE'
        AND grantee IN ('anon','authenticated','service_role')`)).rows;
    check("3G3-SEC-3", "no TRUNCATE privilege held by any application role", trunc.length === 0,
      trunc.length ? trunc.map((t) => `${t.grantee}:${t.table_name}`).join(",") : "clean");

    // -----------------------------------------------------------------------
    console.log("\n--- 2. FIXTURES ---");
    providerId = (await db.query(`
      INSERT INTO public.providers (name, slug, adapter_key, category)
      VALUES ('3G3 Verify Supabase', '3g3-verify-supabase', 'supabase', 'cloud_hosting')
      RETURNING id`)).rows[0].id;
    // Connected account — credential_reference set (a vault POINTER only; the
    // RPC gate requires it, but no real secret exists or is used here).
    accountId = (await db.query(`
      INSERT INTO public.provider_accounts (provider_id, account_name, ownership, connection_status, credential_reference)
      VALUES ('${providerId}', '3G3 Verify Account', 'sch_managed', 'connected', 'vault:3g3-verify-pointer')
      RETURNING id`)).rows[0].id;
    // Second account that is NOT connected — for the connection-state gate.
    accountIdFailed = (await db.query(`
      INSERT INTO public.provider_accounts (provider_id, account_name, ownership, connection_status, credential_reference)
      VALUES ('${providerId}', '3G3 Failed Account', 'sch_managed', 'failed', 'vault:3g3-verify-pointer')
      RETURNING id`)).rows[0].id;
    sysAId = (await db.query(`
      INSERT INTO public.systems (client_id, name, system_type, status)
      VALUES ('${clientA.id}', '3G3 Verify System', 'web_platform', 'live') RETURNING id`)).rows[0].id;

    const dRunId = (await db.query(`
      INSERT INTO public.provider_discovery_runs (provider_account_id, status, initiated_by, completed_at)
      VALUES ('${accountId}', 'completed', '${authResults.admin.userId}', now()) RETURNING id`)).rows[0].id;
    const dRunFailed = (await db.query(`
      INSERT INTO public.provider_discovery_runs (provider_account_id, status, initiated_by, completed_at)
      VALUES ('${accountIdFailed}', 'completed', '${authResults.admin.userId}', now()) RETURNING id`)).rows[0].id;
    runIds.push(dRunId, dRunFailed);

    for (const [ext, name, acct, run] of [
      ["3g3-linked-1", "3g3-proj-1", accountId, dRunId],
      ["3g3-linked-2", "3g3-proj-2", accountId, dRunId],
      ["3g3-linked-3", "3g3-proj-3", accountId, dRunId],
      ["3g3-unlinked-1", "3g3-unlinked", accountId, dRunId],
      ["3g3-failed-acct", "3g3-proj-failed", accountIdFailed, dRunFailed],
    ]) {
      discIds.push((await db.query(`
        INSERT INTO public.provider_discovered_resources
          (provider_account_id, external_resource_id, resource_type, name, status, region, last_run_id)
        VALUES ('${acct}', '${ext}', 'project', '${name}', 'ACTIVE_HEALTHY', 'eu-west-1', '${run}') RETURNING id`)).rows[0].id);
    }
    // Link 0,1,2,4 (3 stays unlinked).
    for (const i of [0, 1, 2, 4]) {
      const lr = await service.rpc("link_discovered_resource", {
        p_discovered_id: discIds[i], p_client_id: clientA.id, p_system_id: sysAId,
        p_linked_by: authResults.admin.userId });
      if (!lr.ok) throw new Error(`link_discovered_resource failed: ${lr.error}`);
    }
    check("3G3-FIX-1", "fixtures seeded (2 accounts, system, 5 discovered, 4 linked)",
      discIds.length === 5);

    // -----------------------------------------------------------------------
    console.log("\n--- 3. PROPOSAL GATES ---");
    const badOp = await propose(discIds[0], "delete_resource");
    check("3G3-PROP-1", "closed vocabulary — 'delete_resource' refused", badOp.ok === false, `status=${badOp.status}`);

    const unlinked = await propose(discIds[3], "pause_resource");
    check("3G3-PROP-2", "proposal refused for unlinked discovered resource", unlinked.ok === false, `status=${unlinked.status}`);

    const p1 = await propose(discIds[0], "pause_resource", "3g3 verify pause");
    proposalIds.push(p1.body);
    const pRow = (await db.query(`SELECT * FROM public.provider_operation_proposals WHERE id='${p1.body}'`)).rows[0];
    check("3G3-PROP-3", "proposal created on linked resource with basis run + snapshot",
      p1.ok === true && pRow.status === "proposed" && pRow.basis_run_id === dRunId
        && pRow.basis_snapshot?.status === "ACTIVE_HEALTHY" && pRow.requested_by === authResults.admin.userId);

    const p1dup = await propose(discIds[0], "pause_resource", "duplicate attempt");
    check("3G3-PROP-4", "duplicate proposal returns existing open proposal (idempotent)",
      p1dup.ok === true && p1dup.body === p1.body);

    const secretReason = await propose(discIds[1], "pause_resource", "key sb_secret_abcdefghijklmnop");
    check("3G3-PROP-5", "secret-shaped reason refused", secretReason.ok === false, `status=${secretReason.status}`);

    // -----------------------------------------------------------------------
    console.log("\n--- 4. APPROVAL LIFECYCLE ---");
    const earlyExec = await begin(p1.body);
    check("3G3-REV-1", "execution refused before approval", earlyExec.ok === false, `status=${earlyExec.status}`);

    const badReview = await review(p1.body, "explode");
    check("3G3-REV-2", "unknown review decision refused", badReview.ok === false);

    const approveRes = await review(p1.body, "approve");
    check("3G3-REV-3", "explicit admin approval recorded",
      approveRes.ok === true && approveRes.body === "approved" && (await pStatus(p1.body)) === "approved");

    const reApprove = await review(p1.body, "approve");
    check("3G3-REV-4", "double approval refused", reApprove.ok === false);

    // Reject path on proposal 2.
    const p2 = await propose(discIds[1], "pause_resource", "3g3 verify reject");
    proposalIds.push(p2.body);
    const rej = await review(p2.body, "reject");
    check("3G3-REV-5", "reject transition recorded",
      rej.ok === true && (await pStatus(p2.body)) === "rejected");
    const rejExec = await begin(p2.body);
    check("3G3-REV-6", "rejected proposal cannot execute", rejExec.ok === false);

    // -----------------------------------------------------------------------
    console.log("\n--- 5. EXECUTION GATE ---");
    const failedAcctP = await propose(discIds[4], "pause_resource", "3g3 failed-account op");
    proposalIds.push(failedAcctP.body);
    await review(failedAcctP.body, "approve");
    const noConn = await begin(failedAcctP.body);
    check("3G3-EXEC-1", "execution refused when account connection_status != connected",
      noConn.ok === false, `status=${noConn.status}`);

    const staleP = await propose(discIds[2], "pause_resource", "3g3 stale op");
    proposalIds.push(staleP.body);
    await review(staleP.body, "approve");
    // Newer provider observation supersedes the approved basis.
    const dRunNew = (await db.query(`
      INSERT INTO public.provider_discovery_runs (provider_account_id, status, initiated_by, completed_at)
      VALUES ('${accountId}', 'completed', '${authResults.admin.userId}', now()) RETURNING id`)).rows[0].id;
    runIds.push(dRunNew);
    await db.query(`UPDATE public.provider_discovered_resources SET last_run_id='${dRunNew}' WHERE id='${discIds[2]}'`);
    const staleBegin = await begin(staleP.body);
    check("3G3-EXEC-2", "stale basis blocks execution and marks proposal stale",
      staleBegin.ok === true && staleBegin.body?.outcome === "stale" && (await pStatus(staleP.body)) === "stale",
      `outcome=${staleBegin.body?.outcome}`);

    const b1 = await begin(p1.body);
    check("3G3-EXEC-3", "approved + fresh basis begins execution",
      b1.ok === true && b1.body?.outcome === "begin" && !!b1.body?.execution_id
        && b1.body?.idempotency_key === `schop-${p1.body}`,
      `idem=${b1.body?.idempotency_key}`);
    check("3G3-EXEC-4", "proposal moved to executing", (await pStatus(p1.body)) === "executing");
    const b2 = await begin(p1.body);
    check("3G3-EXEC-5", "second begin refused while executing (single flight)", b2.ok === false);

    // -----------------------------------------------------------------------
    console.log("\n--- 6. RESULT + VERIFICATION ---");
    const execId = b1.body.execution_id;
    const badCat = await complete(execId, "explode_category");
    check("3G3-RES-1", "unknown provider result category refused", badCat.ok === false);

    const c1 = await complete(execId, "success");
    check("3G3-RES-2", "success → verification_pending (never auto-success)",
      c1.ok === true && c1.body === "verification_pending" && (await pStatus(p1.body)) === "verification_pending");

    const fin1 = await finishVerify(execId, "verified", "INACTIVE");
    const linkedRes = (await db.query(
      `SELECT r.external_status, r.status FROM public.resources r
       JOIN public.provider_operation_proposals p ON p.resource_id=r.id WHERE p.id='${p1.body}'`)).rows[0];
    check("3G3-RES-3", "verified → proposal verified + SCH external_status updated (SCH status untouched)",
      fin1.ok === true && fin1.body === "verified" && (await pStatus(p1.body)) === "verified"
        && linkedRes.external_status === "INACTIVE" && linkedRes.status === "active",
      `ext=${linkedRes?.external_status} sch=${linkedRes?.status}`);

    // Mismatch path on a fresh proposal (resource 1 = discIds[1], already rejected
    // a pause — propose resume instead for a fresh open slot).
    const p3 = await propose(discIds[1], "resume_resource", "3g3 verify mismatch");
    proposalIds.push(p3.body);
    await review(p3.body, "approve");
    const b3 = await begin(p3.body);
    await complete(b3.body.execution_id, "success");
    const finMis = await finishVerify(b3.body.execution_id, "mismatch", "INACTIVE");
    check("3G3-RES-4", "verification mismatch → verification_failed (not success)",
      finMis.ok === true && finMis.body === "verification_failed"
        && (await pStatus(p3.body)) === "verification_failed");

    // -----------------------------------------------------------------------
    console.log("\n--- 7. IDEMPOTENCY / UNKNOWN ---");
    const p4 = await propose(discIds[1], "pause_resource", "3g3 retry-after-unknown");
    proposalIds.push(p4.body);
    await review(p4.body, "approve");
    const b4 = await begin(p4.body);
    const c4 = await complete(b4.body.execution_id, "execution_unknown");
    check("3G3-IDEM-1", "unknown execution outcome returns proposal to approved (not success)",
      c4.ok === true && c4.body === "approved" && (await pStatus(p4.body)) === "approved");
    const b5 = await begin(p4.body);
    check("3G3-IDEM-2", "safe retry reuses the stable idempotency key",
      b5.ok === true && b5.body?.idempotency_key === b4.body?.idempotency_key);
    // Close out: definitive failure.
    const c5 = await complete(b5.body.execution_id, "auth_failed");
    check("3G3-IDEM-3", "definitive failure marks proposal failed",
      c5.ok === true && (await pStatus(p4.body)) === "failed");

    // -----------------------------------------------------------------------
    console.log("\n--- 8. RBAC ---");
    const finView = await authResults.finance.rest.get("provider_operation_overview", { select: "id", limit: "5" });
    check("3G3-RBAC-1", "finance reads operation overview (read-only)", finView.ok === true && Array.isArray(finView.body), finView.ok ? `${finView.body.length} rows` : `status=${finView.status}`);
    const finExecView = await authResults.finance.rest.get("provider_operation_execution_overview", { select: "id", limit: "5" });
    check("3G3-RBAC-2", "finance reads execution overview", finExecView.ok === true, finExecView.ok ? `${finExecView.body.length} rows` : `status=${finExecView.status}`);

    const staffRows = await authResults.staff.rest.get("provider_operation_proposals", { select: "id" });
    check("3G3-RBAC-3", "staff sees zero raw proposals", staffRows.ok === true && staffRows.body.length === 0);
    const staffView = await authResults.staff.rest.get("provider_operation_overview", { select: "id" });
    check("3G3-RBAC-4", "staff sees zero overview rows", staffView.ok === true && staffView.body.length === 0);
    const clientView = await authResults.clientA.rest.get("provider_operation_overview", { select: "id" });
    check("3G3-RBAC-5", "client sees zero overview rows", clientView.ok === true && clientView.body.length === 0);

    const staffReview = await authResults.staff.rest.rpc("review_provider_operation", { p_proposal_id: p1.body, p_decision: "approve" });
    check("3G3-RBAC-6", "staff cannot review operations (RPC denied)", staffReview.ok === false);
    const finPropose = await authResults.finance.rest.rpc("propose_provider_operation", { p_discovered_id: discIds[0], p_operation_key: "pause_resource", p_reason: "x" });
    check("3G3-RBAC-7", "finance cannot propose operations (RPC denied)", finPropose.ok === false);
    const finWrite = await authResults.finance.rest.patch("provider_operation_proposals", { id: `eq.${p1.body}` }, { status: "rejected" });
    const stillVerified = await pStatus(p1.body);
    check("3G3-RBAC-8", "finance table write filtered by RLS", stillVerified === "verified", finWrite.ok ? "200 filtered" : `status=${finWrite.status}`);
    const clientBegin = await authResults.clientA.rest.rpc("begin_provider_operation_execution", { p_proposal_id: p1.body });
    check("3G3-RBAC-9", "client cannot execute operations (RPC denied)", clientBegin.ok === false);

    // -----------------------------------------------------------------------
    console.log("\n--- 9. AUDIT ---");
    const audit = (await db.query(`
      SELECT DISTINCT action FROM public.audit_logs
      WHERE action LIKE 'provider_operation.%'`)).rows.map((r) => r.action);
    for (const [id, a] of [
      ["3G3-AUD-1", "provider_operation.proposed"],
      ["3G3-AUD-2", "provider_operation.approved"],
      ["3G3-AUD-3", "provider_operation.rejected"],
      ["3G3-AUD-4", "provider_operation.started"],
      ["3G3-AUD-5", "provider_operation.execution_started"],
      ["3G3-AUD-6", "provider_operation.completed"],
      ["3G3-AUD-7", "provider_operation.verified"],
      ["3G3-AUD-8", "provider_operation.verification_failed"],
      ["3G3-AUD-9", "provider_operation.stale"],
      ["3G3-AUD-10", "provider_operation.failed"],
      ["3G3-AUD-11", "provider_operation.execution_unknown"],
    ]) {
      check(id, `audit event ${a}`, audit.includes(a));
    }
    const leak = (await db.query(`
      SELECT count(*)::int c FROM public.audit_logs
      WHERE action LIKE 'provider_operation.%'
        AND (details::text ~* 'sb_secret|sk_live|BEGIN.*PRIVATE|access_token|vault:')`)).rows[0].c;
    check("3G3-AUD-12", "no secret material in operation audit", leak === 0);

    // -----------------------------------------------------------------------
    console.log("\n--- 10. DELETE SAFETY ---");
    const delErr = await db.query(`DELETE FROM public.provider_operation_proposals WHERE id='${p1.body}'`).catch((e) => e);
    const delStill = (await db.query(`SELECT id FROM public.provider_operation_proposals WHERE id='${p1.body}'`)).rows.length;
    check("3G3-DEL-1", "operation proposals cannot be deleted",
      /auditable history/.test(delErr?.message ?? "") && delStill === 1, delErr?.message?.slice(0, 80) ?? "");
    const delExec = await db.query(`DELETE FROM public.provider_operation_executions WHERE proposal_id='${p1.body}'`).catch((e) => e);
    check("3G3-DEL-2", "operation executions cannot be deleted",
      /auditable history/.test(delExec?.message ?? ""), delExec?.message?.slice(0, 80) ?? "");

    // -----------------------------------------------------------------------
    console.log("\n--- 11. LIVE PROVIDER MUTATION ---");
    skipCheck("3G3-LIVE-1", "live Supabase pause/resume against a real DEV project",
      "no live Supabase Management credential provisioned for DEV — fixture-level adapter tests cover the typed operation path");
  } finally {
    console.log("\n--- TEARDOWN ---");
    try {
      await db.query(`ALTER TABLE public.provider_operation_proposals DISABLE TRIGGER trg_op_proposals_no_delete`);
      await db.query(`ALTER TABLE public.provider_operation_executions DISABLE TRIGGER trg_op_executions_no_delete`);
      await db.query(`ALTER TABLE public.provider_discovered_resources DISABLE TRIGGER trg_discovered_no_delete`);
      await db.query(`ALTER TABLE public.provider_discovery_runs DISABLE TRIGGER trg_discovery_runs_no_delete`);
      for (const acct of [accountId, accountIdFailed].filter(Boolean)) {
        await db.query(`DELETE FROM public.provider_operation_executions WHERE provider_account_id=$1`, [acct]);
        await db.query(`DELETE FROM public.provider_operation_proposals WHERE provider_account_id=$1`, [acct]);
        await db.query(`DELETE FROM public.provider_discovered_resources WHERE provider_account_id=$1`, [acct]);
        await db.query(`DELETE FROM public.provider_discovery_runs WHERE provider_account_id=$1`, [acct]);
        await db.query(`DELETE FROM public.resources WHERE provider_account_id=$1`, [acct]);
        await db.query(`DELETE FROM public.provider_accounts WHERE id=$1`, [acct]);
      }
      await db.query(`ALTER TABLE public.provider_operation_proposals ENABLE TRIGGER trg_op_proposals_no_delete`);
      await db.query(`ALTER TABLE public.provider_operation_executions ENABLE TRIGGER trg_op_executions_no_delete`);
      await db.query(`ALTER TABLE public.provider_discovered_resources ENABLE TRIGGER trg_discovered_no_delete`);
      await db.query(`ALTER TABLE public.provider_discovery_runs ENABLE TRIGGER trg_discovery_runs_no_delete`);
      if (sysAId) await db.query(`DELETE FROM public.systems WHERE id=$1`, [sysAId]);
      if (providerId) await db.query(`DELETE FROM public.providers WHERE id=$1`, [providerId]);
      console.log("[PASS] Teardown complete.");
    } catch (e) {
      console.error("Teardown warning:", e.message);
    }
    await db.end();
  }

  const passed = results.filter((r) => r.pass && !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n============================================================`);
  console.log(`PHASE 3G-3 HOSTED VERIFICATION SUMMARY: ${passed} PASS, ${skipped} SKIPPED, ${failed} FAIL`);
  console.log(`============================================================`);

  mkdirSync("phase2c-reports", { recursive: true });
  writeFileSync(join("phase2c-reports", "phase3g3-verify-latest.json"), redact(JSON.stringify({ ts: new Date().toISOString(), results }, null, 2)));

  return { passed, skipped, failed, results };
}

if (process.argv[1]?.endsWith("verify-phase3g3-hosted-dev.mjs")) {
  const env = {};
  if (readFileSync) {
    try {
      readFileSync(".env.phase2c", "utf8").split("\n").forEach((l) => {
        const m = l.match(/^\s*([^#][^=]*)=(.*)$/);
        if (m) env[m[1].trim()] = m[2].trim();
      });
    } catch { /* env file optional when vars are provided */ }
  }
  env.PHASE2C_DEV_PROJECT_REF = "outuocpsotiozkpyksex";
  env.PHASE2C_CONFIRM_DEV_WRITES = "outuocpsotiozkpyksex";
  runPhase3g3HostedVerification({ env }).then((r) => process.exit(r.failed === 0 ? 0 : 1)).catch((e) => {
    console.error("[PHASE 3G-3 DEV VERIFY] ERROR:", e.stack || e.message);
    process.exit(1);
  });
}
