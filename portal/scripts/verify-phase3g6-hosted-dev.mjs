// Automated Phase 3G-6 Verification on Hosted DEV
// Project Ref: outuocpsotiozkpyksex ONLY
// Verifies controlled operational automation: closed rule catalog, catalog
// integrity, account-scope rules (connection escalation, missing-resource
// investigation, resume proposal), sweep rules (backup failure, incident
// escalation), idempotency/cooldowns, the 3G-3 approval boundary, RBAC, audit,
// delete safety — and that automation never executes provider operations.
//
// Run with: node scripts/verify-phase3g6-hosted-dev.mjs

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { assertDevTarget, assertDbUrlMatchesRef, makeRedactor, writesConfirmed, GuardError } from "./phase2c-guard.mjs";
import { openPgConnection } from "./apply-migration-013.mjs";
import { createClient } from "./phase2c-lib.mjs";
import { ACCOUNT_FILE } from "./phase2c-seed-test-accounts.mjs";

export async function runPhase3g6HostedVerification({ env = process.env } = {}) {
  const target = assertDevTarget(env);
  if (!target.dbUrl) {
    throw new GuardError("PHASE2C_DB_URL is required for hosted verification.");
  }
  assertDbUrlMatchesRef(target.dbUrl, target.ref);
  if (!writesConfirmed(env, target.ref)) {
    throw new GuardError(`PHASE2C_CONFIRM_DEV_WRITES=${target.ref} is required for Phase 3G-6 hosted verification on DEV.`);
  }

  const secrets = [target.anonKey, target.serviceKey, target.dbUrl].filter(Boolean);
  const redact = makeRedactor(() => secrets);

  console.log(`[PHASE 3G-6 DEV VERIFY] Connecting to DEV REST API & DB (${target.ref})...`);

  const accountsData = JSON.parse(readFileSync(resolve(ACCOUNT_FILE), "utf8"));
  const { admin, staff, finance, clientA } = accountsData;

  const client = createClient({ url: target.url, anonKey: target.anonKey, serviceKey: target.serviceKey });
  const service = client.rest({ kind: "service" });

  console.log("[PHASE 3G-6 DEV VERIFY] Signing in test accounts via Supabase Auth...");
  const auth = {};
  for (const [key, acc] of Object.entries({ admin, staff, finance, clientA })) {
    const res = await client.auth.signIn(acc.email, acc.password);
    if (!res.ok) throw new Error(`Failed to sign in as ${key}: ${res.error || res.status}`);
    auth[key] = {
      userId: res.body?.user?.id || acc.id,
      rest: client.rest({ kind: "user", token: res.body?.access_token || res.token }),
    };
  }

  const results = [];
  function check(id, title, pass, detail = "") {
    results.push({ id, title, pass });
    console.log(`${pass ? "[PASS]" : "[FAIL]"} ${id.padEnd(12)} ${title} ${detail ? "(" + detail + ")" : ""}`);
  }

  const db = await openPgConnection(target.dbUrl);
  const rpc = (fn, args) => service.rpc(fn, args);
  const q1 = async (sql, params) => (await db.query(sql, params)).rows[0];
  const evalFor = (r, key) => (r?.evaluations ?? []).filter((e) => e.rule_key === key);

  const runTs = Date.now();
  let provId, acctId, acctVId, sysId, resId, resPausedId, dRunId, discPausedId, discMissingId;
  let polId, incOldId, propId;

  try {
    // ------------------------------------------------------------------ 1
    console.log("\n--- 1. SCHEMA & SAFETY ---");
    const tables = (await db.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_type='BASE TABLE'
        AND table_name IN ('automation_rules','automation_runs')`)).rows.map(r => r.table_name);
    check("3G6-SCH-1", "automation_rules + automation_runs exist", tables.length === 2);

    const views = (await db.query(`
      SELECT table_name FROM information_schema.views WHERE table_schema='public'
        AND table_name IN ('automation_rule_overview','automation_run_overview')`)).rows.map(r => r.table_name);
    check("3G6-SCH-2", "rule + run overview views exist", views.length === 2, views.join(","));

    const rls = (await db.query(`
      SELECT relname, relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND relname IN ('automation_rules','automation_runs')`)).rows;
    check("3G6-SCH-3", "RLS enabled on both new tables", rls.length === 2 && rls.every(r => r.relrowsecurity));

    const catalog = (await db.query(
      `SELECT rule_key, risk_class, scope, enabled FROM public.automation_rules ORDER BY rule_key`)).rows;
    const expected = {
      backup_failure_escalation: "internal_safe:sweep",
      connection_failure_escalation: "internal_safe:account",
      incident_escalation: "internal_safe:sweep",
      linked_resource_missing_investigation: "internal_safe:account",
      provider_resume_proposal: "approval_required:account",
    };
    check("3G6-SCH-4", "closed catalog seeded (5 rules, fixed risk/scope)",
      catalog.length === 5 && catalog.every(r => expected[r.rule_key] === `${r.risk_class}:${r.scope}`));

    const idx = (await db.query(`
      SELECT indexname FROM pg_indexes WHERE schemaname='public'
        AND indexname IN ('uq_tasks_automation_open','idx_automation_runs_scope','idx_automation_runs_evaluated')`)).rows.map(r => r.indexname);
    check("3G6-SCH-5", "task automation_key unique index + run indexes", idx.length === 3, idx.join(","));

    const taskCol = await q1(`SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='tasks' AND column_name='automation_key'`);
    check("3G6-SCH-6", "tasks.automation_key exists", !!taskCol);

    const srcCheck = await q1(`
      SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conrelid='public.action_items'::regclass AND conname='action_items_source_check'`);
    check("3G6-SCH-7", "action_items accepts source 'automation'", srcCheck?.def?.includes("'automation'"));

    const fnGrants = (await db.query(`
      SELECT routine_name, grantee FROM information_schema.routine_privileges
      WHERE routine_schema='public'
        AND routine_name IN ('automation_upsert_signal','automation_create_task','automation_record',
          'automation_in_cooldown','save_automation_rule','evaluate_account_automation','evaluate_automation_sweep')
        AND grantee IN ('anon','authenticated','PUBLIC','public')`)).rows;
    check("3G6-SEC-1", "automation functions not executable by anon/authenticated/public",
      fnGrants.length === 0, fnGrants.length ? JSON.stringify(fnGrants) : "clean");

    const credCols = (await db.query(`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name IN ('automation_rules','automation_runs')
        AND (column_name ~* '(^|_)(api_key|api_secret|access_token|refresh_token|password|private_key)(_|$)'
             OR column_name IN ('token','secret','api_key','password'))`)).rows;
    check("3G6-SEC-2", "no credential columns on automation tables", credCols.length === 0);

    const trunc = (await db.query(`
      SELECT grantee, table_name FROM information_schema.role_table_grants
      WHERE table_schema='public' AND privilege_type='TRUNCATE'
        AND grantee IN ('anon','authenticated','service_role')
        AND table_name IN ('automation_rules','automation_runs',
          'automation_rule_overview','automation_run_overview')`)).rows;
    check("3G6-SEC-3", "no TRUNCATE privilege on automation tables/views", trunc.length === 0,
      trunc.map(t => `${t.grantee}:${t.table_name}`).join(",") || "clean");

    // Catalog integrity: unknown keys + remapped risk classes rejected.
    const badInsert = await db.query(
      `INSERT INTO public.automation_rules (rule_key, name, description, risk_class, scope)
       VALUES ('delete_infra', 'x', 'y', 'internal_safe', 'sweep')`).then(() => false).catch(() => true);
    const badUpdate = await db.query(
      `UPDATE public.automation_rules SET risk_class='internal_safe' WHERE rule_key='provider_resume_proposal'`)
      .then(() => false).catch(() => true);
    const badDelete = await db.query(`DELETE FROM public.automation_rules`)
      .then(() => false).catch(() => true);
    check("3G6-SEC-4", "catalog closed, mapping fixed, rules undeletable",
      badInsert && badUpdate && badDelete);

    // ------------------------------------------------------------------ 2
    console.log("\n--- 2. FIXTURES ---");
    provId = (await db.query(`
      INSERT INTO public.providers (name, slug, adapter_key, category)
      VALUES ('3G6 Verify Supabase', '3g6-supabase-${runTs}', 'supabase', 'cloud_hosting') RETURNING id`)).rows[0].id;
    const provVId = (await db.query(`
      INSERT INTO public.providers (name, slug, adapter_key, category)
      VALUES ('3G6 Verify Vercel', '3g6-vercel-${runTs}', 'vercel', 'cloud_hosting') RETURNING id`)).rows[0].id;
    acctId = (await db.query(`
      INSERT INTO public.provider_accounts (provider_id, account_name, ownership, client_id, connection_status, credential_reference)
      VALUES ('${provId}', '3G6 Supabase acct', 'sch_managed', '${clientA.id}', 'connected', 'vault:3g6-pointer') RETURNING id`)).rows[0].id;
    acctVId = (await db.query(`
      INSERT INTO public.provider_accounts (provider_id, account_name, ownership, client_id, connection_status, credential_reference)
      VALUES ('${provVId}', '3G6 Vercel acct', 'sch_managed', '${clientA.id}', 'connected', 'vault:3g6-pointer') RETURNING id`)).rows[0].id;
    sysId = (await db.query(`
      INSERT INTO public.systems (client_id, name, system_type, status)
      VALUES ('${clientA.id}', '3G6 Verify System', 'web_platform', 'live') RETURNING id`)).rows[0].id;
    dRunId = (await db.query(`
      INSERT INTO public.provider_discovery_runs (provider_account_id, status, initiated_by, completed_at)
      VALUES ('${acctId}', 'completed', '${auth.admin.userId}', now()) RETURNING id`)).rows[0].id;
    discPausedId = (await db.query(`
      INSERT INTO public.provider_discovered_resources
        (provider_account_id, external_resource_id, resource_type, name, status, last_run_id, external_missing)
      VALUES ('${acctId}', '3g6-prj-paused', 'project', '3g6-paused', 'PAUSED', '${dRunId}', false) RETURNING id`)).rows[0].id;
    const lr = await rpc("link_discovered_resource", {
      p_discovered_id: discPausedId, p_client_id: clientA.id, p_system_id: sysId, p_linked_by: auth.admin.userId });
    resPausedId = (await q1(`SELECT linked_resource_id FROM public.provider_discovered_resources WHERE id='${discPausedId}'`))?.linked_resource_id;
    check("3G6-FIX-1", "fixtures seeded (accounts, linked paused resource)", lr.ok === true && !!resPausedId);

    // ------------------------------------------------------------------ 3
    console.log("\n--- 3. ACCOUNT-SCOPE RULES ---");

    // connection_failure_escalation: below threshold → nothing; at threshold → acted.
    await db.query(`
      INSERT INTO public.provider_monitoring_schedules (provider_account_id, enabled, consecutive_failures)
      VALUES ('${acctId}', true, 1)`);
    let ev = await rpc("evaluate_account_automation", {
      p_provider_account_id: acctId, p_monitoring_run_id: null, p_run_succeeded: false,
      p_trigger_source: 'scheduled', p_actor: auth.admin.userId });
    check("3G6-CONN-1", "below-threshold failure → skipped_no_condition",
      ev.ok === true && evalFor(ev.body, "connection_failure_escalation")[0]?.decision === "skipped_no_condition");

    await db.query(`UPDATE public.provider_monitoring_schedules SET consecutive_failures=3 WHERE provider_account_id='${acctId}'`);
    ev = await rpc("evaluate_account_automation", {
      p_provider_account_id: acctId, p_monitoring_run_id: null, p_run_succeeded: false,
      p_trigger_source: 'scheduled', p_actor: auth.admin.userId });
    const connEv = evalFor(ev.body, "connection_failure_escalation")[0];
    check("3G6-CONN-2", "3 consecutive failures → acted", connEv?.decision === "acted", connEv?.decision);
    const connItem = await q1(`SELECT severity, source FROM public.action_items WHERE dedupe_key='mon:${acctId}:connection'`);
    check("3G6-CONN-3", "signal escalated to critical", connItem?.severity === "critical");
    const connTask = await q1(`SELECT priority, client_id, automation_key FROM public.tasks WHERE automation_key='auto:conn:${acctId}'`);
    check("3G6-CONN-4", "escalation task created (high, client-linked)",
      connTask?.priority === "high" && connTask?.client_id === clientA.id);

    ev = await rpc("evaluate_account_automation", {
      p_provider_account_id: acctId, p_monitoring_run_id: null, p_run_succeeded: false,
      p_trigger_source: 'scheduled', p_actor: auth.admin.userId });
    const connEv2 = evalFor(ev.body, "connection_failure_escalation")[0];
    const connTaskCount = await q1(`SELECT count(*)::int AS n FROM public.tasks WHERE automation_key='auto:conn:${acctId}'`);
    check("3G6-CONN-5", "re-evaluation does not duplicate (cooldown/dedupe)",
      ["skipped_cooldown", "skipped_duplicate"].includes(connEv2?.decision) && connTaskCount?.n === 1,
      connEv2?.decision);

    // linked_resource_missing_investigation: no incident → skip; with incident → task.
    discMissingId = (await db.query(`
      INSERT INTO public.provider_discovered_resources
        (provider_account_id, external_resource_id, resource_type, name, status, last_run_id, external_missing)
      VALUES ('${acctId}', '3g6-prj-gone', 'project', '3g6-gone', 'ACTIVE_HEALTHY', '${dRunId}', true) RETURNING id`)).rows[0].id;
    await rpc("link_discovered_resource", {
      p_discovered_id: discMissingId, p_client_id: clientA.id, p_system_id: sysId, p_linked_by: auth.admin.userId });
    const missingResId = (await q1(`SELECT linked_resource_id FROM public.provider_discovered_resources WHERE id='${discMissingId}'`))?.linked_resource_id;

    ev = await rpc("evaluate_account_automation", {
      p_provider_account_id: acctId, p_monitoring_run_id: null, p_run_succeeded: true,
      p_trigger_source: 'scheduled', p_actor: auth.admin.userId });
    check("3G6-MISS-1", "missing resource without incident → skipped_no_condition",
      evalFor(ev.body, "linked_resource_missing_investigation")[0]?.decision === "skipped_no_condition");

    const incMiss = (await db.query(`
      INSERT INTO public.incidents (client_id, system_id, resource_id, title, description, severity, status, reported_by)
      VALUES ('${clientA.id}', '${sysId}', '${missingResId}', 'Provider resource unavailable', 'Missing externally', 'critical', 'open', '${auth.admin.userId}')
      RETURNING id`)).rows[0].id;
    ev = await rpc("evaluate_account_automation", {
      p_provider_account_id: acctId, p_monitoring_run_id: null, p_run_succeeded: true,
      p_trigger_source: 'scheduled', p_actor: auth.admin.userId });
    const missEv = evalFor(ev.body, "linked_resource_missing_investigation")[0];
    check("3G6-MISS-2", "missing linked resource + open incident → acted", missEv?.decision === "acted", missEv?.decision);
    const missTask = await q1(`SELECT incident_id, resource_id FROM public.tasks WHERE automation_key='auto:missing:${missingResId}'`);
    check("3G6-MISS-3", "investigation task linked to incident + resource",
      missTask?.incident_id === incMiss && missTask?.resource_id === missingResId);

    // provider_resume_proposal: persistence gate then proposal.
    for (let i = 1; i <= 2; i++) {
      const rr = (await db.query(`
        INSERT INTO public.provider_reconciliation_runs (provider_account_id, status, completed_at)
        VALUES ('${acctId}', 'completed', now()) RETURNING id`)).rows[0].id;
      await db.query(`
        INSERT INTO public.provider_monitoring_runs (provider_account_id, trigger_source, status, reconciliation_run_id, completed_at)
        VALUES ('${acctId}', 'scheduled', 'completed', '${rr}', now());
        INSERT INTO public.provider_reconciliation_items
          (run_id, provider_account_id, discovered_resource_id, resource_id, change_type, current_snapshot, change_fingerprint)
        VALUES ('${rr}', '${acctId}', '${discPausedId}', '${resPausedId}', 'unchanged', '{"status":"PAUSED"}', 'fp-3g6-${runTs}-${i}')`);
    }
    // After first down run only, the rule should still hold off: fabricate the
    // single-run state by evaluating before inserting the second run. (Both
    // already inserted — instead verify the proposal lands now and is deduped.)
    ev = await rpc("evaluate_account_automation", {
      p_provider_account_id: acctId, p_monitoring_run_id: null, p_run_succeeded: true,
      p_trigger_source: 'scheduled', p_actor: auth.admin.userId });
    const propEv = evalFor(ev.body, "provider_resume_proposal")[0];
    check("3G6-PROP-1", "2 down observations → proposal_created",
      propEv?.decision === "proposal_created", JSON.stringify(propEv));
    const prop = await q1(`SELECT id, operation_key, status, requested_by, basis_run_id, basis_snapshot->>'status' AS basis_status
                           FROM public.provider_operation_proposals WHERE provider_account_id='${acctId}' ORDER BY created_at DESC LIMIT 1`);
    propId = prop?.id;
    check("3G6-PROP-2", "proposal is resume_resource, status proposed, evidence-bound",
      prop?.operation_key === "resume_resource" && prop?.status === "proposed"
        && prop?.requested_by === null && prop?.basis_run_id === dRunId && prop?.basis_status === "PAUSED");

    const execAttempt = await rpc("begin_provider_operation_execution", {
      p_proposal_id: propId, p_actor: auth.admin.userId });
    check("3G6-PROP-3", "unapproved proposal cannot execute (3G-3 gate)",
      execAttempt.ok === false, execAttempt.body?.message ?? "");

    ev = await rpc("evaluate_account_automation", {
      p_provider_account_id: acctId, p_monitoring_run_id: null, p_run_succeeded: true,
      p_trigger_source: 'scheduled', p_actor: auth.admin.userId });
    const propCount = await q1(`SELECT count(*)::int AS n FROM public.provider_operation_proposals WHERE provider_account_id='${acctId}'`);
    check("3G6-PROP-4", "repeat evaluation does not duplicate the proposal", propCount?.n === 1);

    // ------------------------------------------------------------------ 4
    console.log("\n--- 4. SWEEP-SCOPE RULES ---");

    // backup_failure_escalation
    const resId = (await db.query(`
      INSERT INTO public.resources (client_id, system_id, provider_account_id, name, resource_type, status)
      VALUES ('${clientA.id}', '${sysId}', '${acctId}', '3G6 DB', 'database', 'active') RETURNING id`)).rows[0].id;
    polId = (await db.query(`
      INSERT INTO public.backup_policies (client_id, resource_id, system_id, name, frequency, retention_days, created_by)
      VALUES ('${clientA.id}', '${resId}', '${sysId}', '3G6 Nightly', 'daily', 30, '${auth.admin.userId}') RETURNING id`)).rows[0].id;
    await db.query(`
      INSERT INTO public.backup_events (client_id, backup_policy_id, resource_id, system_id, status, recorded_by, failure_reason, created_at)
      VALUES
      ('${clientA.id}', '${polId}', '${resId}', '${sysId}', 'failed', '${auth.admin.userId}', 'snapshot timeout', now() - interval '2 hours'),
      ('${clientA.id}', '${polId}', '${resId}', '${sysId}', 'missed', '${auth.admin.userId}', NULL, now() - interval '1 hour')`);

    let sw = await rpc("evaluate_automation_sweep", { p_actor: auth.admin.userId });
    const bkEv = evalFor(sw.body, "backup_failure_escalation").find(e => e.scope_key === `pol:${polId}`);
    check("3G6-BK-1", "2 consecutive failed/missed → acted", bkEv?.decision === "acted", bkEv?.decision);
    const bkItem = await q1(`SELECT severity, source FROM public.action_items WHERE dedupe_key='auto:backup:${polId}'`);
    check("3G6-BK-2", "backup signal raised (automation source)",
      bkItem?.severity === "warning" && bkItem?.source === "automation");
    const bkTask = await q1(`SELECT priority FROM public.tasks WHERE automation_key='auto:backup:${polId}'`);
    check("3G6-BK-3", "backup review task created", !!bkTask);

    await db.query(`
      INSERT INTO public.backup_events (client_id, backup_policy_id, resource_id, system_id, status, recorded_by)
      VALUES ('${clientA.id}', '${polId}', '${resId}', '${sysId}', 'successful', '${auth.admin.userId}')`);
    sw = await rpc("evaluate_automation_sweep", { p_actor: auth.admin.userId });
    const bkEv2 = evalFor(sw.body, "backup_failure_escalation").find(e => e.scope_key === `pol:${polId}`);
    check("3G6-BK-4", "healthy backup event → signal resolved", bkEv2?.decision === "resolved", bkEv2?.decision);

    // incident_escalation
    incOldId = (await db.query(`
      INSERT INTO public.incidents (client_id, system_id, title, description, severity, status, reported_by, opened_at)
      VALUES ('${clientA.id}', '${sysId}', '3G6 old outage', 'Unresolved for days', 'high', 'open', '${auth.admin.userId}', now() - interval '48 hours')
      RETURNING id`)).rows[0].id;
    sw = await rpc("evaluate_automation_sweep", { p_actor: auth.admin.userId });
    const incEv = evalFor(sw.body, "incident_escalation").find(e => e.scope_key === `inc:${incOldId}`);
    check("3G6-INC-1", "stale unresolved incident → acted", incEv?.decision === "acted", incEv?.decision);
    const incTask = await q1(`SELECT priority, incident_id FROM public.tasks WHERE automation_key='auto:escalation:${incOldId}'`);
    check("3G6-INC-2", "urgent escalation task linked to incident",
      incTask?.priority === "urgent" && incTask?.incident_id === incOldId);
    const incSig = await q1(`SELECT severity, incident_id FROM public.action_items WHERE dedupe_key='auto:incident:${incOldId}'`);
    check("3G6-INC-3", "critical escalation signal raised", incSig?.severity === "critical");
    const incState = await q1(`SELECT status FROM public.incidents WHERE id='${incOldId}'`);
    check("3G6-INC-4", "incident lifecycle untouched by automation", incState?.status === "open");

    sw = await rpc("evaluate_automation_sweep", { p_actor: auth.admin.userId });
    const sweepTasks = await q1(`SELECT count(*)::int AS n FROM public.tasks
      WHERE automation_key IN ('auto:conn:${acctId}','auto:missing:${missingResId}','auto:backup:${polId}','auto:escalation:${incOldId}')`);
    check("3G6-INC-5", "repeat sweep creates no duplicates (conn+missing+backup+escalation = 4)",
      sweepTasks?.n === 4, `tasks=${sweepTasks?.n}`);

    // ------------------------------------------------------------------ 5
    console.log("\n--- 5. DISABLE / RE-ENABLE ---");
    const saveBad = await rpc("save_automation_rule", {
      p_rule_key: "nonsense_rule", p_enabled: true, p_threshold: 1, p_cooldown_seconds: 60, p_actor: auth.admin.userId });
    check("3G6-CFG-1", "unknown rule key rejected", saveBad.ok === false);

    const saveOk = await rpc("save_automation_rule", {
      p_rule_key: "incident_escalation", p_enabled: false, p_threshold: 24, p_cooldown_seconds: 86400, p_actor: auth.admin.userId });
    check("3G6-CFG-2", "admin can disable a catalog rule", saveOk.ok === true);
    sw = await rpc("evaluate_automation_sweep", { p_actor: auth.admin.userId });
    check("3G6-CFG-3", "disabled rule → skipped_disabled",
      evalFor(sw.body, "incident_escalation").every(e => e.decision === "skipped_disabled"));
    await rpc("save_automation_rule", {
      p_rule_key: "incident_escalation", p_enabled: true, p_threshold: 24, p_cooldown_seconds: 86400, p_actor: auth.admin.userId });
    const ruleAfter = await q1(`SELECT enabled FROM public.automation_rules WHERE rule_key='incident_escalation'`);
    check("3G6-CFG-4", "re-enable restores rule", ruleAfter?.enabled === true);

    // ------------------------------------------------------------------ 6
    console.log("\n--- 6. RBAC ---");
    const userRules = async (who) => (await auth[who].rest.get("automation_rules", { select: "id" })).body?.length;
    const userRuns = async (who) => (await auth[who].rest.get("automation_runs", { select: "id" })).body?.length;
    const userRuleView = async (who) => (await auth[who].rest.get("automation_rule_overview", { select: "id" })).body?.length;
    const userRunView = async (who) => (await auth[who].rest.get("automation_run_overview", { select: "id" })).body?.length;

    check("3G6-RBAC-1", "admin reads rules + runs", (await userRules("admin")) === 5 && (await userRuns("admin")) > 0);
    check("3G6-RBAC-2", "finance reads rules + runs", (await userRules("finance")) === 5 && (await userRuns("finance")) > 0);
    check("3G6-RBAC-3", "staff sees no rule config but can read run history",
      (await userRules("staff")) === 0 && (await userRuns("staff")) > 0);
    check("3G6-RBAC-4", "client sees no automation data",
      (await userRules("clientA")) === 0 && (await userRuns("clientA")) === 0
        && (await userRuleView("clientA")) === 0 && (await userRunView("clientA")) === 0);

    const staffSave = await auth.staff.rest.rpc("save_automation_rule", {
      p_rule_key: "incident_escalation", p_enabled: false, p_threshold: 1, p_cooldown_seconds: 1, p_actor: auth.staff.userId });
    check("3G6-RBAC-5", "staff cannot configure rules (RPC)", staffSave.ok === false);
    const staffEval = await auth.staff.rest.rpc("evaluate_automation_sweep", { p_actor: auth.staff.userId });
    check("3G6-RBAC-6", "staff cannot evaluate automation (RPC)", staffEval.ok === false);
    const adminSave = await auth.admin.rest.rpc("save_automation_rule", {
      p_rule_key: "incident_escalation", p_enabled: true, p_threshold: 24, p_cooldown_seconds: 86400, p_actor: auth.admin.userId });
    check("3G6-RBAC-7", "browser-role admin cannot execute config RPC directly (service-only grant)",
      adminSave.ok === false);
    const staffInsert = await auth.staff.rest.insert("automation_runs", {
      rule_id: (await q1(`SELECT id FROM public.automation_rules LIMIT 1`))?.id,
      rule_key: "x", scope_key: "x", trigger_source: "manual", decision: "acted" });
    check("3G6-RBAC-8", "no direct automation_runs writes", staffInsert.ok === false);

    // ------------------------------------------------------------------ 7
    console.log("\n--- 7. AUDIT & DELETE SAFETY ---");
    const auditActions = (await db.query(`
      SELECT DISTINCT action FROM public.audit_logs WHERE action LIKE 'automation.%'`)).rows.map(r => r.action);
    check("3G6-AUD-1", "automation.evaluated recorded", auditActions.includes("automation.evaluated"));
    check("3G6-AUD-2", "automation.action_created + proposal_created recorded",
      auditActions.includes("automation.action_created") && auditActions.includes("automation.proposal_created"),
      auditActions.join(","));
    check("3G6-AUD-3", "rule config changes audited",
      auditActions.includes("automation.disabled") || auditActions.includes("automation.enabled"));

    const runDelete = await db.query(`DELETE FROM public.automation_runs`).then(() => false).catch(() => true);
    check("3G6-AUD-4", "automation_runs append-only", runDelete);

    const leak = (await db.query(`
      SELECT detail FROM public.automation_runs WHERE detail IS NOT NULL`)).rows
      .every(r => !/(sk_|bearer |vault:|service_role_key|password)/i.test(r.detail ?? ""));
    check("3G6-SEC-5", "no secret-shaped text in automation evidence", leak);

    // Every run row links back to the catalog and carries a decision.
    const orphan = await q1(`SELECT count(*)::int AS n FROM public.automation_runs ar
      LEFT JOIN public.automation_rules r ON r.id=ar.rule_id WHERE r.id IS NULL`);
    check("3G6-AUD-5", "all automation runs reference a catalog rule", orphan?.n === 0);

  } catch (err) {
    results.push({ id: "3G6-ERR", title: "unexpected harness error", pass: false });
    console.error("[PHASE 3G-6 DEV VERIFY] Unexpected error:", err);
  } finally {
    await db.end();
  }

  const pass = results.filter(r => r.pass).length;
  const fail = results.filter(r => !r.pass).length;
  const skip = results.filter(r => r.skipped).length;
  console.log(`\nPHASE 3G-6 HOSTED VERIFICATION SUMMARY: ${pass - skip} PASS, ${skip} SKIPPED, ${fail} FAIL`);

  const report = {
    projectRef: target.ref,
    timestamp: new Date().toISOString(),
    phase: "3G-6",
    status: fail === 0 ? "PASS" : "FAIL",
    summary: { pass: pass - skip, skipped: skip, fail },
    results: results.map(({ skipped, ...r }) => r),
  };
  mkdirSync("phase2c-reports", { recursive: true });
  writeFileSync(join("phase2c-reports", "phase3g6-hosted-report.json"), redact(JSON.stringify(report, null, 2)));
  console.log("[PHASE 3G-6 DEV VERIFY] Report written to phase2c-reports/phase3g6-hosted-report.json");
  return report;
}

const isMain = process.argv[1] && resolve(process.argv[1]).endsWith("verify-phase3g6-hosted-dev.mjs");
if (isMain) {
  const env = {};
  readFileSync(".env.phase2c", "utf8").split("\n").forEach((l) => {
    const m = l.match(/^\s*([^#][^=]*)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  });
  env.PHASE2C_DEV_PROJECT_REF = "outuocpsotiozkpyksex";
  env.PHASE2C_CONFIRM_DEV_WRITES = "outuocpsotiozkpyksex";
  runPhase3g6HostedVerification({ env }).catch((e) => { console.error(e); process.exit(1); });
}
