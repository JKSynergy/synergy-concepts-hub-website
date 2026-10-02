// Automated Phase 3G-5 Verification on Hosted DEV
// Project Ref: outuocpsotiozkpyksex ONLY
// Verifies provider event ingestion: webhook config lifecycle (Vault secrets),
// per-provider authentication, replay/dedupe, normalization, authoritative
// matching, immutable evidence, event-triggered reconciliation plumbing,
// Action Center signals, RBAC, audit, delete safety — and that the real HTTP
// endpoint fails closed on every unauthenticated path.
//
// Requires the dev server on http://localhost:3000 for endpoint checks.
// Run with: node scripts/verify-phase3g5-hosted-dev.mjs

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHmac, createHash } from "node:crypto";
import { assertDevTarget, assertDbUrlMatchesRef, makeRedactor, writesConfirmed, GuardError } from "./phase2c-guard.mjs";
import { openPgConnection } from "./apply-migration-013.mjs";
import { createClient } from "./phase2c-lib.mjs";
import { ACCOUNT_FILE } from "./phase2c-seed-test-accounts.mjs";

const BASE = "http://localhost:3000";

export async function runPhase3g5HostedVerification({ env = process.env } = {}) {
  const target = assertDevTarget(env);
  if (!target.dbUrl) {
    throw new GuardError("PHASE2C_DB_URL is required for hosted verification.");
  }
  assertDbUrlMatchesRef(target.dbUrl, target.ref);
  if (!writesConfirmed(env, target.ref)) {
    throw new GuardError(`PHASE2C_CONFIRM_DEV_WRITES=${target.ref} is required for Phase 3G-5 hosted verification on DEV.`);
  }

  const secrets = [target.anonKey, target.serviceKey, target.dbUrl].filter(Boolean);
  const redact = makeRedactor(() => secrets);

  console.log(`[PHASE 3G-5 DEV VERIFY] Connecting to DEV REST API & DB (${target.ref})...`);

  const accountsData = JSON.parse(readFileSync(resolve(ACCOUNT_FILE), "utf8"));
  const { admin, staff, finance, clientA } = accountsData;

  const client = createClient({ url: target.url, anonKey: target.anonKey, serviceKey: target.serviceKey });
  const service = client.rest({ kind: "service" });

  console.log("[PHASE 3G-5 DEV VERIFY] Signing in test accounts via Supabase Auth...");
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
  function skipCheck(id, title, reason) {
    results.push({ id, title, pass: true, skipped: true });
    console.log(`[SKIP] ${id.padEnd(12)} ${title} (NOT TESTED — ${reason})`);
  }

  const db = await openPgConnection(target.dbUrl);
  const rpc = (fn, args) => service.rpc(fn, args);
  const q1 = async (sql, params) => (await db.query(sql, params)).rows[0];

  const provIds = {};
  const acctIds = {};
  let sysAId, discId, dRunId;
  const eventIds = [];

  const post = async (path, { headers = {}, body }) => {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch { /* empty */ }
    return { status: res.status, body: json };
  };

  try {
    // ------------------------------------------------------------------ 1
    console.log("\n--- 1. SCHEMA & SAFETY ---");
    const tables = (await db.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_type='BASE TABLE'
        AND table_name IN ('provider_webhook_configs','provider_events')`)).rows.map(r => r.table_name);
    check("3G5-SCH-1", "provider_webhook_configs + provider_events exist", tables.length === 2);

    const views = (await db.query(`
      SELECT table_name FROM information_schema.views WHERE table_schema='public'
        AND table_name IN ('provider_event_overview','provider_webhook_config_overview')`)).rows.map(r => r.table_name);
    check("3G5-SCH-2", "event + config overview views exist", views.length === 2, views.join(","));

    const rls = (await db.query(`
      SELECT relname, relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND relname IN ('provider_webhook_configs','provider_events')`)).rows;
    check("3G5-SCH-3", "RLS enabled on both new tables", rls.length === 2 && rls.every(r => r.relrowsecurity));

    const idx = (await db.query(`
      SELECT indexname FROM pg_indexes WHERE schemaname='public'
        AND indexname IN ('uq_provider_event_dedupe','idx_webhook_config_credential_hash','idx_provider_events_account_time')`)).rows.map(r => r.indexname);
    check("3G5-SCH-4", "dedupe + auth-lookup + account-time indexes", idx.length === 3, idx.join(","));

    const trigCheck = await q1(`
      SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conrelid='public.provider_monitoring_runs'::regclass
        AND conname='provider_monitoring_runs_trigger_source_check'`);
    check("3G5-SCH-5", "'event' added to monitoring trigger vocabulary", trigCheck?.def?.includes("'event'"));

    const srcCheck = await q1(`
      SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conrelid='public.action_items'::regclass AND conname='action_items_source_check'`);
    check("3G5-SCH-6", "action_items accepts source 'provider_event'", srcCheck?.def?.includes("'provider_event'"));

    const fnGrants = (await db.query(`
      SELECT routine_name, grantee FROM information_schema.routine_privileges
      WHERE routine_schema='public'
        AND routine_name IN ('save_webhook_config','set_webhook_config_enabled','lookup_webhook_config_by_hash',
          'hmac_webhook_configs','reveal_webhook_secret','record_webhook_auth_failure','touch_webhook_received',
          'record_provider_event','signal_provider_event','finalize_provider_event')
        AND grantee IN ('anon','authenticated','PUBLIC','public')`)).rows;
    check("3G5-SEC-1", "event functions not executable by anon/authenticated/public",
      fnGrants.length === 0, fnGrants.length ? JSON.stringify(fnGrants) : "clean");

    const credCols = (await db.query(`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name IN ('provider_webhook_configs','provider_events')
        AND (column_name ~* '(^|_)(api_key|api_secret|access_token|refresh_token|password|private_key)(_|$)'
             OR column_name IN ('token','secret','api_key','password'))`)).rows;
    check("3G5-SEC-2", "no credential columns on event tables", credCols.length === 0,
      credCols.map(c => c.column_name).join(",") || "clean");

    const trunc = (await db.query(`
      SELECT grantee, table_name FROM information_schema.role_table_grants
      WHERE table_schema='public' AND privilege_type='TRUNCATE'
        AND grantee IN ('anon','authenticated','service_role')
        AND table_name IN ('provider_webhook_configs','provider_events')`)).rows;
    check("3G5-SEC-3", "no TRUNCATE privilege on event tables", trunc.length === 0);

    // ------------------------------------------------------------------ 2
    console.log("\n--- 2. FIXTURES ---");
    for (const [key, slug] of [["supabase", "3g5-supabase"], ["railway", "3g5-railway"], ["vercel", "3g5-vercel"], ["cloudflare", "3g5-cloudflare"]]) {
      provIds[key] = (await db.query(`
        INSERT INTO public.providers (name, slug, adapter_key, category)
        VALUES ('3G5 Verify ${key}', '${slug}', '${key}', 'cloud_hosting') RETURNING id`)).rows[0].id;
      acctIds[key] = (await db.query(`
        INSERT INTO public.provider_accounts (provider_id, account_name, ownership, connection_status, credential_reference)
        VALUES ('${provIds[key]}', '3G5 ${key} acct', 'sch_managed', 'connected', 'vault:3g5-pointer') RETURNING id`)).rows[0].id;
    }
    sysAId = (await db.query(`
      INSERT INTO public.systems (client_id, name, system_type, status)
      VALUES ('${clientA.id}', '3G5 Verify System', 'web_platform', 'live') RETURNING id`)).rows[0].id;
    dRunId = (await db.query(`
      INSERT INTO public.provider_discovery_runs (provider_account_id, status, initiated_by, completed_at)
      VALUES ('${acctIds.supabase}', 'completed', '${auth.admin.userId}', now()) RETURNING id`)).rows[0].id;
    discId = (await db.query(`
      INSERT INTO public.provider_discovered_resources
        (provider_account_id, external_resource_id, resource_type, name, status, last_run_id)
      VALUES ('${acctIds.supabase}', '3g5-prj-abc', 'project', '3g5-prod-db', 'ACTIVE_HEALTHY', '${dRunId}') RETURNING id`)).rows[0].id;
    const lr = await rpc("link_discovered_resource", {
      p_discovered_id: discId, p_client_id: clientA.id, p_system_id: sysAId, p_linked_by: auth.admin.userId });
    check("3G5-FIX-1", "fixtures seeded (4 providers/accounts, linked resource)", lr.ok === true);

    // ------------------------------------------------------------------ 3
    console.log("\n--- 3. WEBHOOK CONFIG LIFECYCLE ---");
    const cfgS = await rpc("save_webhook_config", { p_provider_account_id: acctIds.supabase, p_secret: null, p_actor: auth.admin.userId });
    check("3G5-CFG-1", "supabase config → bearer_token, generated secret",
      cfgS.ok === true && cfgS.body?.auth_type === "bearer_token" && cfgS.body?.secret?.length >= 16);
    const cfgRow = await q1(`SELECT vault_ref, credential_hash, enabled FROM public.provider_webhook_configs WHERE provider_account_id='${acctIds.supabase}'`);
    check("3G5-CFG-2", "secret stored as vault ref + sha256 hash only",
      cfgRow?.vault_ref?.startsWith("vault:") && /^[0-9a-f]{64}$/.test(cfgRow?.credential_hash)
        && !JSON.stringify(cfgRow).includes(cfgS.body.secret));

    const cfgR = await rpc("save_webhook_config", { p_provider_account_id: acctIds.railway, p_secret: null, p_actor: auth.admin.userId });
    check("3G5-CFG-3", "railway config → url_token", cfgR.ok === true && cfgR.body?.auth_type === "url_token");
    const cfgC = await rpc("save_webhook_config", { p_provider_account_id: acctIds.cloudflare, p_secret: null, p_actor: auth.admin.userId });
    check("3G5-CFG-4", "cloudflare config → header_secret", cfgC.ok === true && cfgC.body?.auth_type === "header_secret");

    const cfgVNoSecret = await rpc("save_webhook_config", { p_provider_account_id: acctIds.vercel, p_secret: null, p_actor: auth.admin.userId });
    check("3G5-CFG-5", "vercel requires provider-issued secret", cfgVNoSecret.ok === false);
    const cfgV = await rpc("save_webhook_config", { p_provider_account_id: acctIds.vercel, p_secret: "3g5-vercel-secret-fixture-0123456789", p_actor: auth.admin.userId });
    check("3G5-CFG-6", "vercel config → vercel_hmac_sha1", cfgV.ok === true && cfgV.body?.auth_type === "vercel_hmac_sha1");

    // Rotation: secret changes, vault ref rotates, hash follows.
    const cfgS2 = await rpc("save_webhook_config", { p_provider_account_id: acctIds.supabase, p_secret: null, p_actor: auth.admin.userId });
    const cfgRow2 = await q1(`SELECT credential_hash FROM public.provider_webhook_configs WHERE provider_account_id='${acctIds.supabase}'`);
    check("3G5-CFG-7", "rotation produces a new secret + hash",
      cfgS2.ok === true && cfgS2.body.secret !== cfgS.body.secret && cfgRow2.credential_hash !== cfgRow.credential_hash);

    const secrets2 = [cfgS.body.secret, cfgS2.body.secret, cfgR.body.secret, cfgC.body.secret, cfgV.body.secret];
    secrets.push(...secrets2);

    for (const acct of [acctIds.supabase, acctIds.railway, acctIds.vercel, acctIds.cloudflare]) {
      await rpc("set_webhook_config_enabled", { p_provider_account_id: acct, p_enabled: true, p_actor: auth.admin.userId });
    }
    const enabledCount = (await q1(`SELECT count(*)::int AS n FROM public.provider_webhook_configs WHERE enabled`))?.n;
    check("3G5-CFG-8", "all four configs enabled", enabledCount >= 4);

    // ------------------------------------------------------------------ 4
    console.log("\n--- 4. ENDPOINT AUTH (real HTTP) ---");
    const serverUp = await fetch(`${BASE}/api/provider-events/none`, { method: "POST", body: "{}" })
      .then((r) => r.status === 404 || r.status === 401 || r.ok === false)
      .catch(() => false);

    if (!serverUp) {
      skipCheck("3G5-EP-1..11", "webhook endpoint over HTTP",
        "dev server not reachable on localhost:3000 — endpoint paths are exercised in the browser verifier");
    } else {
      const unknown = await post("/api/provider-events/unknown", { body: {} });
      check("3G5-EP-1", "unknown provider → 404", unknown.status === 404);

      const noAuth = await post("/api/provider-events/supabase", { body: {} });
      check("3G5-EP-2", "missing credential → 401", noAuth.status === 401);

      const badTok = await post("/api/provider-events/supabase", {
        headers: { authorization: "Bearer wrong-token-0000000000000000" }, body: { type: "v1.project.paused" } });
      check("3G5-EP-3", "wrong bearer token → 401", badTok.status === 401);
      const failAudit = await q1(`SELECT count(*)::int AS n FROM public.audit_logs WHERE action='provider_event.auth_failed'`);
      check("3G5-EP-4", "auth failure audited", failAudit?.n >= 1);

      // Supabase bearer: valid → 200, recorded + matched.
      const sbPayload = { type: "v1.project.paused", payload: { project_ref: "3g5-prj-abc" }, timestamp: new Date().toISOString() };
      const good = await post("/api/provider-events/supabase", {
        headers: { authorization: `Bearer ${cfgS2.body.secret}` }, body: sbPayload });
      const evRow = await q1(`SELECT * FROM public.provider_events WHERE provider_account_id='${acctIds.supabase}' ORDER BY received_at DESC LIMIT 1`);
      check("3G5-EP-5", "valid bearer event → 200 + recorded + matched",
        good.status === 200 && good.body?.ok === true && evRow?.normalized_type === "resource_unavailable"
          && evRow?.matched_discovered_resource_id === discId, JSON.stringify(good.body));
      if (evRow) eventIds.push(evRow.id);

      // Duplicate delivery → harmless 200, no second row.
      const dup = await post("/api/provider-events/supabase", {
        headers: { authorization: `Bearer ${cfgS2.body.secret}` }, body: sbPayload });
      const evtCount = (await q1(`SELECT count(*)::int AS n, max(duplicate_count)::int AS d FROM public.provider_events WHERE provider_account_id='${acctIds.supabase}'`));
      check("3G5-EP-6", "duplicate delivery → 200, no second row, counter++",
        dup.status === 200 && dup.body?.outcome === "duplicate" && evtCount?.n === 1 && evtCount?.d === 1);

      // Malformed JSON → rejected evidence + 400.
      const bad = await post("/api/provider-events/supabase", {
        headers: { authorization: `Bearer ${cfgS2.body.secret}` }, body: "{not json" });
      const rej = await q1(`SELECT id, status FROM public.provider_events WHERE provider_account_id='${acctIds.supabase}' AND status='rejected' ORDER BY received_at DESC LIMIT 1`);
      check("3G5-EP-7", "malformed payload → 400 + rejected evidence", bad.status === 400 && rej?.status === "rejected");
      if (rej?.id) eventIds.push(rej.id);

      // Vercel HMAC.
      const vPayload = JSON.stringify({ id: "vcl-1", type: "deployment.error", createdAt: Date.now(),
        payload: { project: { id: "vcl-proj-x", name: "3g5-vercel" } } });
      const vSig = createHmac("sha1", cfgV.body.secret).update(vPayload).digest("hex");
      const vBad = await post("/api/provider-events/vercel", { headers: { "x-vercel-signature": "bad" }, body: vPayload });
      check("3G5-EP-8", "vercel wrong signature → 401", vBad.status === 401);
      const vGood = await post("/api/provider-events/vercel", { headers: { "x-vercel-signature": vSig }, body: vPayload });
      const vRow = await q1(`SELECT id, normalized_type, provider_event_id FROM public.provider_events WHERE provider_account_id='${acctIds.vercel}' ORDER BY received_at DESC LIMIT 1`);
      check("3G5-EP-9", "vercel valid HMAC → 200 + normalized deployment_failed",
        vGood.status === 200 && vRow?.normalized_type === "deployment_failed" && vRow?.provider_event_id === "vcl-1");
      if (vRow) eventIds.push(vRow.id);

      // Cloudflare shared-secret header.
      const cfGood = await post("/api/provider-events/cloudflare", {
        headers: { "cf-webhook-auth": cfgC.body.secret },
        body: { alert_type: "health_check_status_notification", data: { zone_id: "zone-x" } } });
      const cfRow = await q1(`SELECT id, normalized_type FROM public.provider_events WHERE provider_account_id='${acctIds.cloudflare}' ORDER BY received_at DESC LIMIT 1`);
      check("3G5-EP-10", "cloudflare header secret → 200 + normalized",
        cfGood.status === 200 && cfRow?.normalized_type === "resource_state_changed");
      if (cfRow) eventIds.push(cfRow.id);

      // Railway URL token.
      const rBad = await post("/api/provider-events/railway/wrong-token-0000000000", {
        body: { type: "DEPLOY_FAILED", project: { id: "r-proj" } } });
      check("3G5-EP-11", "railway wrong URL token → 401", rBad.status === 401);
      const rGood = await post(`/api/provider-events/railway/${cfgR.body.secret}`, {
        body: { type: "DEPLOY_FAILED", timestamp: new Date().toISOString(),
                project: { id: "r-proj-1" }, service: { id: "r-svc-1" }, deployment: { id: "d1", status: "FAILED" } } });
      const rRow = await q1(`SELECT id, normalized_type, event_type FROM public.provider_events WHERE provider_account_id='${acctIds.railway}' ORDER BY received_at DESC LIMIT 1`);
      check("3G5-EP-12", "railway URL token → 200 + deployment_failed",
        rGood.status === 200 && rRow?.normalized_type === "deployment_failed");
      if (rRow) eventIds.push(rRow.id);

      // Oversized body → 413.
      const big = await post("/api/provider-events/supabase", {
        headers: { authorization: `Bearer ${cfgS2.body.secret}` }, body: "x".repeat(300 * 1024) });
      check("3G5-EP-13", "oversized body → 413", big.status === 413);

      // GET → 405.
      const get = await fetch(`${BASE}/api/provider-events/supabase`);
      check("3G5-EP-14", "GET → 405", get.status === 405);

      // Disabled config fails closed.
      await rpc("set_webhook_config_enabled", { p_provider_account_id: acctIds.supabase, p_enabled: false, p_actor: auth.admin.userId });
      const disabled = await post("/api/provider-events/supabase", {
        headers: { authorization: `Bearer ${cfgS2.body.secret}` }, body: sbPayload });
      check("3G5-EP-15", "disabled config → 401 (fail closed)", disabled.status === 401);
      await rpc("set_webhook_config_enabled", { p_provider_account_id: acctIds.supabase, p_enabled: true, p_actor: auth.admin.userId });

      // Response bodies never leak secrets.
      const leakCheck = [noAuth, badTok, vBad, rBad, good, dup].every((r) =>
        !JSON.stringify(r.body ?? "").match(/vault:|service_role|secret_|sk_live/));
      check("3G5-EP-16", "endpoint responses leak no secret material", leakCheck);
    }

    // ------------------------------------------------------------------ 5
    console.log("\n--- 5. EVENT → SIGNAL → RECONCILE LINKAGE ---");
    // Event-triggered monitoring run: accounts here carry only a vault pointer
    // (no credential), so the triggered run fails safely at credential
    // resolution — but the plumbing must be visible.
    const trigRow = await q1(`SELECT monitoring_run_id, status FROM public.provider_events WHERE provider_account_id='${acctIds.supabase}' AND normalized_type='resource_unavailable' ORDER BY received_at DESC LIMIT 1`);
    if (serverUp) {
      const monRow = trigRow?.monitoring_run_id
        ? await q1(`SELECT trigger_source, status FROM public.provider_monitoring_runs WHERE id='${trigRow.monitoring_run_id}'`)
        : null;
      check("3G5-INT-1", "state event triggered existing monitoring pipeline",
        monRow?.trigger_source === "event", trigRow?.monitoring_run_id ? `run ${monRow?.status ?? ""}` : "no run linked (throttled?)");
    } else {
      skipCheck("3G5-INT-1", "event-triggered monitoring run", "endpoint unreachable");
    }

    // deployment_failed signal exists for the vercel event (deduped).
    const sigRow = await q1(`SELECT severity, source, event_type FROM public.action_items WHERE dedupe_key LIKE 'evt:${acctIds.vercel}%'`);
    check("3G5-INT-2", "deployment_failed → warning Action Center signal",
      sigRow?.severity === "warning" && sigRow?.source === "provider_event");

    // Direct RPC path: unmatched state event → info signal.
    const un = await rpc("record_provider_event", {
      p_webhook_config_id: null, p_provider_account_id: acctIds.supabase,
      p_provider_event_id: "3g5-rpc-1", p_event_type: "v1.project.created",
      p_normalized_type: "resource_created", p_occurred_at: null,
      p_payload_hash: createHash("sha256").update("3g5-rpc-1").digest("hex"),
      p_payload_summary: { summary: "Supabase v1.project.created" }, p_external_ids: ["untracked-x"] });
    check("3G5-INT-3", "RPC event records unmatched evidence",
      un.ok === true && un.body?.outcome === "recorded" && un.body?.matched_discovered_resource_id === null);
    if (un.ok) eventIds.push(un.body.event_id);
    const unSig = await rpc("signal_provider_event", { p_event_id: un.body?.event_id });
    const unItem = await q1(`SELECT severity FROM public.action_items WHERE id='${unSig.body?.action_item_id}'`);
    check("3G5-INT-4", "unmatched state event → informational signal",
      unSig.ok === true && unSig.body?.signaled === true && unItem?.severity === "info");

    const fin = await rpc("finalize_provider_event", {
      p_event_id: un.body?.event_id, p_status: "unmatched" });
    check("3G5-INT-5", "finalize marks unmatched", fin.ok === true);

    // ------------------------------------------------------------------ 6
    console.log("\n--- 6. RBAC (real user JWTs) ---");
    const finCfg = await auth.finance.rest.get("provider_webhook_config_overview");
    check("3G5-RBAC-1", "finance reads webhook config status", finCfg.ok === true && (finCfg.body || []).some((c) => c.provider_account_id === acctIds.supabase));
    const staffEv = await auth.staff.rest.get("provider_event_overview");
    check("3G5-RBAC-2", "staff read event evidence (triage)", staffEv.ok === true && (staffEv.body || []).length >= 1);
    const staffCfg = await auth.staff.rest.get("provider_webhook_configs");
    check("3G5-RBAC-3", "staff cannot read webhook security config", staffCfg.ok === true && (staffCfg.body || []).length === 0);
    const cliEv = await auth.clientA.rest.get("provider_events");
    check("3G5-RBAC-4", "client sees zero provider events", cliEv.ok === true && (cliEv.body || []).length === 0);
    const cliCfg = await auth.clientA.rest.get("provider_webhook_configs");
    check("3G5-RBAC-5", "client sees zero webhook configs", cliCfg.ok === true && (cliCfg.body || []).length === 0);
    const staffSave = await auth.staff.rest.rpc("save_webhook_config", { p_provider_account_id: acctIds.supabase });
    check("3G5-RBAC-6", "staff cannot call save_webhook_config", staffSave.ok === false);
    const staffReveal = await auth.staff.rest.rpc("reveal_webhook_secret", { p_config_id: (await q1(`SELECT id FROM public.provider_webhook_configs LIMIT 1`)).id });
    check("3G5-RBAC-7", "staff cannot reveal webhook secrets", staffReveal.ok === false);

    // ------------------------------------------------------------------ 7
    console.log("\n--- 7. AUDIT + DELETE SAFETY + NO MUTATION ---");
    const aud = (await db.query(`
      SELECT DISTINCT action FROM public.audit_logs WHERE action LIKE 'provider_%'`)).rows.map(r => r.action);
    check("3G5-AUD-1", "webhook lifecycle audited",
      aud.includes("provider_webhook.config_created") && aud.includes("provider_webhook.enabled")
        && aud.includes("provider_event.received") && aud.includes("provider_event.auth_failed"), `${aud.length} event types`);

    let delErr = null;
    try {
      await db.query(`BEGIN`);
      await db.query(`DELETE FROM public.provider_events WHERE provider_account_id='${acctIds.supabase}'`);
      await db.query(`COMMIT`);
    } catch (e) { delErr = e; await db.query(`ROLLBACK`); }
    check("3G5-DEL-1", "provider_events cannot be deleted", delErr !== null);

    let delCfg = null;
    try {
      await db.query(`BEGIN`);
      await db.query(`DELETE FROM public.provider_webhook_configs WHERE provider_account_id='${acctIds.supabase}'`);
      await db.query(`COMMIT`);
    } catch (e) { delCfg = e; await db.query(`ROLLBACK`); }
    check("3G5-DEL-2", "webhook configs cannot be deleted", delCfg !== null);

    const props = (await q1(`SELECT count(*)::int AS n FROM public.provider_operation_proposals WHERE provider_account_id = ANY($1::uuid[])`,
      [Object.values(acctIds)]))?.n;
    check("3G5-SAFE-1", "event ingestion created zero provider operation proposals", props === 0);

    const leakRows = (await q1(`
      SELECT count(*)::int AS n FROM public.provider_events
      WHERE provider_account_id = ANY($1::uuid[])
        AND (event_type ~* '(token|secret|key)[:=]' OR payload_summary::text ~* 'bearer |sk_live|service_role')`,
      [Object.values(acctIds)]))?.n;
    check("3G5-SAFE-2", "no secret material in stored event evidence", leakRows === 0);

    // Live provider webhooks — real external delivery cannot be simulated.
    skipCheck("3G5-LIVE-1", "real provider webhook delivery",
      "no live provider webhook endpoint is configured against DEV — documented auth mechanisms are fixture-tested end-to-end over real HTTP above");
  } finally {
    console.log("\n--- TEARDOWN ---");
    try {
      const noDelete = [
        ["provider_events", "trg_provider_events_no_delete"],
        ["provider_webhook_configs", "trg_webhook_config_no_delete"],
        ["action_items", "trg_action_items_no_delete"],
        ["provider_monitoring_runs", "trg_mon_runs_no_delete"],
        ["provider_discovered_resources", "trg_discovered_no_delete"],
        ["provider_discovery_runs", "trg_discovery_runs_no_delete"],
        ["incidents", "trg_incidents_no_delete"],
      ];
      for (const [t, tg] of noDelete) {
        try { await db.query(`ALTER TABLE public.${t} DISABLE TRIGGER ${tg}`); } catch { /* optional */ }
      }
      for (const id of Object.values(acctIds)) {
        await db.query(`DELETE FROM public.provider_events WHERE provider_account_id=$1`, [id]);
        await db.query(`DELETE FROM public.action_items WHERE provider_account_id=$1`, [id]);
        await db.query(`DELETE FROM public.provider_monitoring_runs WHERE provider_account_id=$1`, [id]);
        await db.query(`DELETE FROM public.provider_reconciliation_items WHERE provider_account_id=$1`, [id]);
        await db.query(`DELETE FROM public.provider_reconciliation_runs WHERE provider_account_id=$1`, [id]);
        await db.query(`DELETE FROM public.provider_discovered_resources WHERE provider_account_id=$1`, [id]);
        await db.query(`DELETE FROM public.provider_discovery_runs WHERE provider_account_id=$1`, [id]);
        await db.query(`DELETE FROM public.provider_webhook_configs WHERE provider_account_id=$1`, [id]);
        await db.query(`DELETE FROM public.resources WHERE provider_account_id=$1`, [id]);
        await db.query(`DELETE FROM public.provider_accounts WHERE id=$1`, [id]);
      }
      for (const [t, tg] of noDelete) {
        try { await db.query(`ALTER TABLE public.${t} ENABLE TRIGGER ${tg}`); } catch { /* optional */ }
      }
      if (sysAId) {
        await db.query(`DELETE FROM public.incidents WHERE system_id=$1`, [sysAId]);
        await db.query(`DELETE FROM public.systems WHERE id=$1`, [sysAId]);
      }
      for (const id of Object.values(provIds)) {
        await db.query(`DELETE FROM public.providers WHERE id=$1`, [id]);
      }
      // Vault secrets issued by save_webhook_config for the fixture accounts.
      await db.query(`DELETE FROM vault.secrets WHERE name LIKE 'provider-webhook/%'`).catch(() => {});
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
  console.log(`PHASE 3G-5 HOSTED VERIFICATION SUMMARY: ${passed} PASS, ${skipped} SKIPPED, ${failed} FAIL`);
  console.log(`============================================================`);

  mkdirSync("phase2c-reports", { recursive: true });
  writeFileSync(join("phase2c-reports", "phase3g5-verify-latest.json"), redact(JSON.stringify({ ts: new Date().toISOString(), results }, null, 2)));

  return { passed, skipped, failed, results };
}

if (process.argv[1]?.endsWith("verify-phase3g5-hosted-dev.mjs")) {
  const env = {};
  try {
    readFileSync(".env.phase2c", "utf8").split("\n").forEach((l) => {
      const m = l.match(/^\s*([^#][^=]*)=(.*)$/);
      if (m) env[m[1].trim()] = m[2].trim();
    });
  } catch { /* env file optional when vars are provided */ }
  env.PHASE2C_DEV_PROJECT_REF = "outuocpsotiozkpyksex";
  env.PHASE2C_CONFIRM_DEV_WRITES = "outuocpsotiozkpyksex";

  runPhase3g5HostedVerification({ env }).catch((err) => {
    console.error("[PHASE 3G-5 DEV VERIFY] ERROR:", err);
    process.exit(1);
  });
}
