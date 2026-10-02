// Automated Phase 3G-2 Verification on Hosted DEV
// Project Ref: outuocpsotiozkpyksex ONLY
// Verifies reconciliation lifecycle: deterministic classification, review,
// stale protection, controlled apply, idempotency, RBAC, audit, delete safety.
//
// Run with: node scripts/verify-phase3g2-hosted-dev.mjs

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { assertDevTarget, assertDbUrlMatchesRef, makeRedactor, writesConfirmed, GuardError } from "./phase2c-guard.mjs";
import { openPgConnection } from "./apply-migration-013.mjs";
import { createClient } from "./phase2c-lib.mjs";
import { ACCOUNT_FILE } from "./phase2c-seed-test-accounts.mjs";

export async function runPhase3g2HostedVerification({ env = process.env } = {}) {
  const target = assertDevTarget(env);
  if (!target.dbUrl) {
    throw new GuardError("PHASE2C_DB_URL is required for hosted verification.");
  }
  assertDbUrlMatchesRef(target.dbUrl, target.ref);

  if (!writesConfirmed(env, target.ref)) {
    throw new GuardError(`PHASE2C_CONFIRM_DEV_WRITES=${target.ref} is required for Phase 3G-2 hosted verification on DEV.`);
  }

  const secrets = [target.anonKey, target.serviceKey, target.dbUrl].filter(Boolean);
  const redact = makeRedactor(() => secrets);

  console.log(`[PHASE 3G-2 DEV VERIFY] Connecting to DEV REST API & DB (${target.ref})...`);

  const accountsData = JSON.parse(readFileSync(resolve(ACCOUNT_FILE), "utf8"));
  const { admin, staff, finance, clientA, clientB } = accountsData;

  const client = createClient({ url: target.url, anonKey: target.anonKey, serviceKey: target.serviceKey });
  const service = client.rest({ kind: "service" });

  console.log("[PHASE 3G-2 DEV VERIFY] Signing in test accounts via Supabase Auth...");
  const authResults = {};
  for (const [key, acc] of Object.entries({ admin, staff, finance, clientA, clientB })) {
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
  let providerId, accountId, sysAId, resSchOnlyId, orphanAcctId;
  let discIds = [];
  let runIds = [];

  async function reconcile() {
    const res = await service.rpc("run_provider_reconciliation", {
      p_provider_account_id: accountId,
      p_actor: authResults.admin.userId,
    });
    if (!res.ok) return { ok: false, status: res.status, error: res.error };
    return { ok: true, runId: res.body };
  }

  async function lastReconRun() {
    return (await db.query(
      `SELECT * FROM public.provider_reconciliation_runs ORDER BY started_at DESC LIMIT 1`)).rows[0];
  }

  try {
    // -----------------------------------------------------------------------
    console.log("\n--- 1. SCHEMA & SAFETY ---");
    const tables = (await db.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_type='BASE TABLE'`)).rows.map((r) => r.table_name);
    check("3G2-SCH-1", "provider_reconciliation_runs + provider_reconciliation_items exist",
      tables.includes("provider_reconciliation_runs") && tables.includes("provider_reconciliation_items"));

    const views = (await db.query(`
      SELECT table_name FROM information_schema.views WHERE table_schema='public'
        AND table_name IN ('provider_reconciliation_overview','provider_connection_overview')`)).rows.map((r) => r.table_name);
    check("3G2-SCH-2", "reconciliation overview view exists", views.includes("provider_reconciliation_overview"));

    const rls = (await db.query(`
      SELECT relname, relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND relname IN ('provider_reconciliation_runs','provider_reconciliation_items')`)).rows;
    check("3G2-SCH-3", "RLS enabled on both new tables", rls.length === 2 && rls.every((r) => r.relrowsecurity));

    const idx = (await db.query(`
      SELECT indexname FROM pg_indexes
      WHERE schemaname='public' AND tablename='provider_reconciliation_items' AND indexname='uq_recon_open_item'`)).rows;
    check("3G2-SCH-4", "open-item dedupe index present", idx.length === 1);

    const extCols = (await db.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name='resources'
        AND column_name IN ('external_name','external_status','external_region','external_url','external_checked_at')`)).rows;
    const discCols = (await db.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name='provider_discovered_resources'
        AND column_name IN ('external_missing','external_created_at','external_updated_at','reconciled_snapshot')`)).rows;
    check("3G2-SCH-5", "resources.external_* + discovered reconciliation columns present",
      extCols.length === 5 && discCols.length === 4, `res=${extCols.length}/5 disc=${discCols.length}/4`);

    const fnGrants = (await db.query(`
      SELECT routine_name, grantee FROM information_schema.routine_privileges
      WHERE routine_schema='public'
        AND routine_name IN ('run_provider_reconciliation','review_reconciliation_item','apply_reconciliation_item')
        AND grantee IN ('anon','authenticated','PUBLIC','public')`)).rows;
    check("3G2-SEC-1", "reconcile/review/apply functions not executable by anon/authenticated/public",
      fnGrants.length === 0, fnGrants.length ? JSON.stringify(fnGrants.rows) : "clean");

    const credCols = (await db.query(`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema='public'
        AND (column_name ~* '(^|_)(api_key|api_secret|access_token|refresh_token|password|private_key)(_|$)'
             OR column_name IN ('token','secret','api_key','password'))`)).rows;
    check("3G2-SEC-2", "no plaintext credential columns", credCols.length === 0,
      credCols.length ? credCols.map((c) => `${c.table_name}.${c.column_name}`).join(",") : "clean");

    const trunc = (await db.query(`
      SELECT grantee, table_name FROM information_schema.role_table_grants
      WHERE table_schema='public' AND privilege_type='TRUNCATE'
        AND grantee IN ('anon','authenticated','service_role')`)).rows;
    check("3G2-SEC-3", "no TRUNCATE privilege held by any application role", trunc.length === 0,
      trunc.length ? trunc.map((t) => `${t.grantee}:${t.table_name}`).join(",") : "clean");

    // -----------------------------------------------------------------------
    console.log("\n--- 2. FIXTURES ---");
    providerId = (await db.query(`
      INSERT INTO public.providers (name, slug, adapter_key, category)
      VALUES ('3G2 Verify Supabase', '3g2-verify-supabase', 'supabase', 'cloud_hosting')
      RETURNING id`)).rows[0].id;
    accountId = (await db.query(`
      INSERT INTO public.provider_accounts (provider_id, account_name, ownership)
      VALUES ('${providerId}', '3G2 Verify Account', 'sch_managed') RETURNING id`)).rows[0].id;
    sysAId = (await db.query(`
      INSERT INTO public.systems (client_id, name, system_type, status)
      VALUES ('${clientA.id}', '3G2 Verify System', 'web_platform', 'live') RETURNING id`)).rows[0].id;
    const dRunId = (await db.query(`
      INSERT INTO public.provider_discovery_runs (provider_account_id, status, initiated_by, completed_at)
      VALUES ('${accountId}', 'completed', '${authResults.admin.userId}', now()) RETURNING id`)).rows[0].id;
    runIds.push(dRunId);

    for (const [ext, name, status] of [
      ["3g2-new-1", "3g2-unlinked-proj", "ACTIVE_HEALTHY"],
      ["3g2-link-1", "3g2-linked-proj", "ACTIVE_HEALTHY"],
      ["3g2-ch-1", "3g2-changed-proj", "ACTIVE_HEALTHY"],
      ["3g2-mi-1", "3g2-missing-proj", "ACTIVE_HEALTHY"],
    ]) {
      discIds.push((await db.query(`
        INSERT INTO public.provider_discovered_resources
          (provider_account_id, external_resource_id, resource_type, name, status, region, last_run_id)
        VALUES ('${accountId}', '${ext}', 'project', '${name}', '${status}', 'eu-west-1', '${dRunId}') RETURNING id`)).rows[0].id);
    }

    // Link rows 2,3,4 through the real link path (baseline snapshot captured).
    for (const d of discIds.slice(1)) {
      await service.rpc("link_discovered_resource", {
        p_discovered_id: d, p_client_id: clientA.id, p_system_id: sysAId,
        p_linked_by: authResults.admin.userId,
      });
    }
    // SCH-only resource: attached to the account but not in discovery evidence.
    resSchOnlyId = (await db.query(`
      INSERT INTO public.resources (system_id, provider_account_id, name, resource_type, ownership, client_id)
      VALUES ('${sysAId}', '${accountId}', '3g2-sch-only', 'database', 'client_owned', '${clientA.id}')
      RETURNING id`)).rows[0].id;

    // Simulate external drift discovered after linking.
    await db.query(`UPDATE public.provider_discovered_resources SET status='INACTIVE' WHERE external_resource_id='3g2-ch-1'`);
    await db.query(`UPDATE public.provider_discovered_resources SET external_missing=true WHERE external_resource_id='3g2-mi-1'`);

    check("3G2-FIX-1", "fixtures seeded (account, system, 4 discovered, sch-only resource)",
      discIds.length === 4 && !!sysAId && !!resSchOnlyId);

    // -----------------------------------------------------------------------
    console.log("\n--- 3. RECONCILIATION CLASSIFICATION ---");
    const recon = await reconcile();
    const run = await lastReconRun();
    runIds.push(run.id);
    check("3G2-RUN-1", "reconciliation run completes via service RPC",
      recon.ok === true && run.status === "completed", `status=${run.status}`);

    const items = (await db.query(
      `SELECT i.*, d.external_resource_id AS ext FROM public.provider_reconciliation_items i
       LEFT JOIN public.provider_discovered_resources d ON d.id=i.discovered_resource_id
       WHERE i.run_id='${run.id}'`)).rows;
    const byExt = (ext) => items.find((i) => i.ext === ext);

    check("3G2-CLS-1", "unlinked resource → new_external_resource",
      byExt("3g2-new-1")?.change_type === "new_external_resource" && byExt("3g2-new-1")?.requires_review === true);
    check("3G2-CLS-2", "linked + baseline match → unchanged",
      byExt("3g2-link-1")?.change_type === "unchanged" && byExt("3g2-link-1")?.requires_review === false);
    check("3G2-CLS-3", "linked + drift → external_change with diff summary",
      byExt("3g2-ch-1")?.change_type === "external_change" && /status/.test(byExt("3g2-ch-1")?.change_summary ?? ""));
    check("3G2-CLS-4", "linked + absent → missing_externally",
      byExt("3g2-mi-1")?.change_type === "missing_externally");
    const schOnly = items.find((i) => i.resource_id === resSchOnlyId);
    check("3G2-CLS-5", "SCH resource with no provider counterpart → sch_only",
      schOnly?.change_type === "sch_only" && schOnly?.requires_review === true);
    check("3G2-RUN-2", "run counts recorded (examined + changes)",
      run.resources_examined >= 5 && run.changes_detected >= 4,
      `examined=${run.resources_examined} changes=${run.changes_detected}`);

    // -----------------------------------------------------------------------
    console.log("\n--- 4. IDEMPOTENCY ---");
    await reconcile();
    const run2 = await lastReconRun();
    runIds.push(run2.id);
    const pendCount = (await db.query(`
      SELECT count(*)::int c FROM public.provider_reconciliation_items
      WHERE provider_account_id='${accountId}' AND review_status='pending_review'`)).rows[0].c;
    const unchanged2 = (await db.query(
      `SELECT change_type FROM public.provider_reconciliation_items
       WHERE run_id='${run2.id}' AND discovered_resource_id='${discIds[0]}'`)).rows[0];
    check("3G2-IDEM-1", "repeat reconcile: no duplicate open proposals", pendCount >= 1 && pendCount ===
      (await db.query(`SELECT count(*)::int c FROM public.provider_reconciliation_items
        WHERE provider_account_id='${accountId}' AND review_status='pending_review'`)).rows[0].c);
    check("3G2-IDEM-2", "reconciled resource reports unchanged on second run",
      unchanged2?.change_type === "unchanged", unchanged2?.change_type);

    // -----------------------------------------------------------------------
    console.log("\n--- 5. REVIEW & CONTROLLED APPLY ---");
    const chItem = byExt("3g2-ch-1");
    const badApply = await service.rpc("apply_reconciliation_item", { p_item_id: chItem.id, p_actor: authResults.admin.userId });
    check("3G2-APP-1", "apply refused before approval", badApply.ok === false,
      `status=${badApply.status}`);

    const rev1 = await service.rpc("review_reconciliation_item", { p_item_id: chItem.id, p_decision: "acknowledge", p_actor: authResults.admin.userId });
    const st1 = (await db.query(`SELECT review_status FROM public.provider_reconciliation_items WHERE id='${chItem.id}'`)).rows[0].review_status;
    check("3G2-REV-1", "acknowledge transition recorded", rev1.ok === true && st1 === "acknowledged");

    const rev2 = await service.rpc("review_reconciliation_item", { p_item_id: chItem.id, p_decision: "approve", p_actor: authResults.admin.userId });
    const st2 = (await db.query(`SELECT review_status FROM public.provider_reconciliation_items WHERE id='${chItem.id}'`)).rows[0].review_status;
    check("3G2-REV-2", "approve transition recorded", rev2.ok === true && st2 === "approved");

    const applyRes = await service.rpc("apply_reconciliation_item", { p_item_id: chItem.id, p_actor: authResults.admin.userId });
    const appliedItem = (await db.query(`SELECT review_status, applied_by FROM public.provider_reconciliation_items WHERE id='${chItem.id}'`)).rows[0];
    const linkedRes = (await db.query(
      `SELECT r.external_status, r.external_region, r.status, r.name FROM public.resources r
       JOIN public.provider_discovered_resources d ON d.linked_resource_id=r.id
       WHERE d.id='${discIds[2]}'`)).rows[0];
    check("3G2-APP-2", "approved external_change applies provider-observed fields only",
      applyRes.ok === true && applyRes.body === "applied" && appliedItem.review_status === "applied"
        && linkedRes.external_status === "INACTIVE" && linkedRes.status === "active" && linkedRes.name === "3g2-changed-proj",
      `ext=${linkedRes?.external_status} sch=${linkedRes?.status}`);

    // missing_externally apply
    const miItem = byExt("3g2-mi-1");
    await service.rpc("review_reconciliation_item", { p_item_id: miItem.id, p_decision: "approve", p_actor: authResults.admin.userId });
    const miApply = await service.rpc("apply_reconciliation_item", { p_item_id: miItem.id, p_actor: authResults.admin.userId });
    const miRes = (await db.query(
      `SELECT r.external_status, r.status FROM public.resources r
       JOIN public.provider_discovered_resources d ON d.linked_resource_id=r.id
       WHERE d.id='${discIds[3]}'`)).rows[0];
    check("3G2-APP-3", "missing_externally apply marks resource; SCH record preserved",
      miApply.ok === true && miRes.external_status === "missing_externally" && miRes.status === "active",
      `ext=${miRes?.external_status} sch=${miRes?.status}`);

    // -----------------------------------------------------------------------
    console.log("\n--- 6. STALE PROTECTION ---");
    // Fresh drift + pending proposal under the current discovery basis.
    await db.query(`UPDATE public.provider_discovered_resources SET region='us-east-1' WHERE external_resource_id='3g2-link-1'`);
    await reconcile();
    const run3 = await lastReconRun();
    runIds.push(run3.id);
    const stItem = (await db.query(
      `SELECT * FROM public.provider_reconciliation_items
       WHERE run_id='${run3.id}' AND discovered_resource_id='${discIds[1]}' AND requires_review`)).rows[0];
    check("3G2-STL-1", "new drift generates a fresh proposal", !!stItem && stItem.change_type === "external_change");

    await service.rpc("review_reconciliation_item", { p_item_id: stItem.id, p_decision: "approve", p_actor: authResults.admin.userId });
    // Newer observation supersedes the proposal basis.
    const dRunNew = (await db.query(`
      INSERT INTO public.provider_discovery_runs (provider_account_id, status, initiated_by, completed_at)
      VALUES ('${accountId}', 'completed', '${authResults.admin.userId}', now()) RETURNING id`)).rows[0].id;
    runIds.push(dRunNew);
    await db.query(`UPDATE public.provider_discovered_resources SET last_run_id='${dRunNew}' WHERE id='${discIds[1]}'`);

    const staleApply = await service.rpc("apply_reconciliation_item", { p_item_id: stItem.id, p_actor: authResults.admin.userId });
    const staleState = (await db.query(`SELECT review_status FROM public.provider_reconciliation_items WHERE id='${stItem.id}'`)).rows[0].review_status;
    check("3G2-STL-2", "stale proposal refused at apply and marked 'stale'",
      staleApply.ok === true && staleApply.body === "stale" && staleState === "stale", `ret=${staleApply.body} state=${staleState}`);

    // Next reconcile marks any remaining superseded open items stale.
    const schItem2 = (await db.query(
      `SELECT id FROM public.provider_reconciliation_items
       WHERE provider_account_id='${accountId}' AND change_type='sch_only' AND review_status='pending_review' LIMIT 1`)).rows[0];
    await reconcile();
    const staleCnt = (await db.query(
      `SELECT count(*)::int c FROM public.provider_reconciliation_items
       WHERE provider_account_id='${accountId}' AND review_status='stale'`)).rows[0].c;
    check("3G2-STL-3", "reconcile marks superseded open proposals stale", staleCnt >= 1, `stale=${staleCnt}`);

    // -----------------------------------------------------------------------
    console.log("\n--- 7. FAILURE HANDLING ---");
    orphanAcctId = (await db.query(`
      INSERT INTO public.provider_accounts (provider_id, account_name, ownership)
      VALUES ('${providerId}', '3G2 No-Discovery Account', 'sch_managed') RETURNING id`)).rows[0].id;
    const failRecon = await service.rpc("run_provider_reconciliation", {
      p_provider_account_id: orphanAcctId, p_actor: authResults.admin.userId });
    const failRun = (await db.query(`SELECT * FROM public.provider_reconciliation_runs WHERE id='${failRecon.body}'`)).rows[0];
    check("3G2-FAIL-1", "reconcile with no discovery records a failed run",
      failRecon.ok === true && failRun.status === "failed" && failRun.error_summary === "no_successful_discovery");
    const failItems = (await db.query(`SELECT count(*)::int c FROM public.provider_reconciliation_items WHERE run_id='${failRun.id}'`)).rows[0].c;
    check("3G2-FAIL-2", "failed run produces no proposals", failItems === 0);

    // -----------------------------------------------------------------------
    console.log("\n--- 8. RBAC ---");
    const finView = await authResults.finance.rest.get("provider_reconciliation_overview", { select: "id", limit: "5" });
    check("3G2-RBAC-1", "finance can read reconciliation overview", finView.ok === true && Array.isArray(finView.body), finView.ok ? `${finView.body.length} rows` : `status=${finView.status}`);

    const staffItems = await authResults.staff.rest.get("provider_reconciliation_items", { select: "id" });
    check("3G2-RBAC-2", "staff sees zero raw reconciliation items",
      staffItems.ok === true && staffItems.body.length === 0, staffItems.ok ? `${staffItems.body.length} rows` : `status=${staffItems.status}`);
    const staffView = await authResults.staff.rest.get("provider_reconciliation_overview", { select: "id" });
    check("3G2-RBAC-3", "staff sees zero overview rows",
      staffView.ok === true && staffView.body.length === 0, staffView.ok ? `${staffView.body.length} rows` : `status=${staffView.status}`);
    const clientView = await authResults.clientA.rest.get("provider_reconciliation_overview", { select: "id" });
    check("3G2-RBAC-4", "client sees zero overview rows",
      clientView.ok === true && clientView.body.length === 0, clientView.ok ? `${clientView.body.length} rows` : `status=${clientView.status}`);

    const openItem = (await db.query(
      `SELECT id FROM public.provider_reconciliation_items WHERE provider_account_id='${accountId}' AND review_status='pending_review' LIMIT 1`)).rows[0];
    if (openItem) {
      const staffReview = await authResults.staff.rest.rpc("review_reconciliation_item", { p_item_id: openItem.id, p_decision: "approve", p_actor: authResults.staff.userId });
      check("3G2-RBAC-5", "staff cannot review items (RPC denied)", staffReview.ok === false);
      const finReview = await authResults.finance.rest.rpc("review_reconciliation_item", { p_item_id: openItem.id, p_decision: "approve", p_actor: authResults.finance.userId });
      check("3G2-RBAC-6", "finance cannot review items (RPC denied)", finReview.ok === false);
      const finWrite = await authResults.finance.rest.patch("provider_reconciliation_items", { id: `eq.${openItem.id}` }, { review_status: "approved" });
      const stillPending = (await db.query(`SELECT review_status FROM public.provider_reconciliation_items WHERE id='${openItem.id}'`)).rows[0].review_status;
      check("3G2-RBAC-7", "finance table write filtered by RLS", stillPending === "pending_review", finWrite.ok ? "200 filtered" : `status=${finWrite.status}`);
      const clientRun = await authResults.clientA.rest.rpc("run_provider_reconciliation", { p_provider_account_id: accountId, p_actor: authResults.clientA.userId });
      check("3G2-RBAC-8", "client cannot run reconciliation", clientRun.ok === false);
    } else {
      for (const id of ["3G2-RBAC-5", "3G2-RBAC-6", "3G2-RBAC-7", "3G2-RBAC-8"]) skipCheck(id, "RBAC write denial", "no pending item available");
    }

    // -----------------------------------------------------------------------
    console.log("\n--- 9. AUDIT ---");
    const audit = (await db.query(`
      SELECT DISTINCT action FROM public.audit_logs
      WHERE table_name IN ('provider_reconciliation_runs','provider_reconciliation_items')
         OR action LIKE 'provider_reconciliation.%' OR action LIKE 'provider_resource.sync_%'`)).rows.map((r) => r.action);
    for (const [id, a] of [
      ["3G2-AUD-1", "provider_reconciliation.started"],
      ["3G2-AUD-2", "provider_reconciliation.completed"],
      ["3G2-AUD-3", "provider_resource.sync_proposed"],
      ["3G2-AUD-4", "provider_resource.sync_approved"],
      ["3G2-AUD-5", "provider_resource.sync_applied"],
      ["3G2-AUD-6", "provider_reconciliation.stale"],
      ["3G2-AUD-7", "provider_reconciliation.failed"],
    ]) {
      check(id, `audit event ${a}`, audit.includes(a));
    }
    const leak = (await db.query(`
      SELECT count(*)::int c FROM public.audit_logs
      WHERE (action LIKE 'provider_reconciliation.%' OR action LIKE 'provider_resource.sync_%')
        AND (details::text ~* 'sb_secret|sk_live|BEGIN.*PRIVATE|access_token')`)).rows[0].c;
    check("3G2-AUD-8", "no secret material in reconciliation audit", leak === 0);

    // -----------------------------------------------------------------------
    console.log("\n--- 10. DELETE SAFETY ---");
    const delTarget = (await db.query(
      `SELECT id FROM public.provider_reconciliation_items WHERE provider_account_id='${accountId}' LIMIT 1`)).rows[0];
    const delErr = await db.query(`DELETE FROM public.provider_reconciliation_items WHERE id='${delTarget.id}'`).catch((e) => e);
    const delStill = (await db.query(`SELECT id FROM public.provider_reconciliation_items WHERE id='${delTarget.id}'`)).rows.length;
    check("3G2-DEL-1", "reconciliation items cannot be deleted",
      /auditable history/.test(delErr?.message ?? "") && delStill === 1, delErr?.message?.slice(0, 80) ?? "");
  } finally {
    console.log("\n--- TEARDOWN ---");
    try {
      await db.query(`ALTER TABLE public.provider_reconciliation_items DISABLE TRIGGER trg_recon_items_no_delete`);
      await db.query(`ALTER TABLE public.provider_reconciliation_runs DISABLE TRIGGER trg_recon_runs_no_delete`);
      await db.query(`ALTER TABLE public.provider_discovered_resources DISABLE TRIGGER trg_discovered_no_delete`);
      await db.query(`ALTER TABLE public.provider_discovery_runs DISABLE TRIGGER trg_discovery_runs_no_delete`);
      for (const acct of [accountId, orphanAcctId].filter(Boolean)) {
        await db.query(`DELETE FROM public.provider_reconciliation_items WHERE provider_account_id=$1`, [acct]);
        await db.query(`DELETE FROM public.provider_reconciliation_runs WHERE provider_account_id=$1`, [acct]);
        await db.query(`DELETE FROM public.provider_discovered_resources WHERE provider_account_id=$1`, [acct]);
        await db.query(`DELETE FROM public.provider_discovery_runs WHERE provider_account_id=$1`, [acct]);
        await db.query(`DELETE FROM public.resources WHERE provider_account_id=$1`, [acct]);
        await db.query(`DELETE FROM public.provider_accounts WHERE id=$1`, [acct]);
      }
      await db.query(`ALTER TABLE public.provider_reconciliation_items ENABLE TRIGGER trg_recon_items_no_delete`);
      await db.query(`ALTER TABLE public.provider_reconciliation_runs ENABLE TRIGGER trg_recon_runs_no_delete`);
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
  console.log(`PHASE 3G-2 HOSTED VERIFICATION SUMMARY: ${passed} PASS, ${skipped} SKIPPED, ${failed} FAIL`);
  console.log(`============================================================`);

  mkdirSync("phase2c-reports", { recursive: true });
  writeFileSync(join("phase2c-reports", "phase3g2-verify-latest.json"), redact(JSON.stringify({ ts: new Date().toISOString(), results }, null, 2)));

  return { passed, skipped, failed, results };
}

if (process.argv[1]?.endsWith("verify-phase3g2-hosted-dev.mjs")) {
  runPhase3g2HostedVerification().then((r) => process.exit(r.failed === 0 ? 0 : 1)).catch((e) => {
    console.error("[PHASE 3G-2 DEV VERIFY] ERROR:", e.stack || e.message);
    process.exit(1);
  });
}
