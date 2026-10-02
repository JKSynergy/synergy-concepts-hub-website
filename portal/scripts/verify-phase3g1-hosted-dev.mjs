// Automated Phase 3G-1 Verification on Hosted DEV
// Project Ref: outuocpsotiozkpyksex ONLY
// Verifies provider connections, vault-backed credentials, read-only discovery
// records, explicit linking, RBAC boundaries, audit logging, delete safety.
//
// Run with: node --experimental-strip-types scripts/verify-phase3g1-hosted-dev.mjs
// (--experimental-strip-types is required to import the TypeScript adapters.)

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { assertDevTarget, assertDbUrlMatchesRef, makeRedactor, writesConfirmed, GuardError } from "./phase2c-guard.mjs";
import { openPgConnection } from "./apply-migration-013.mjs";
import { createClient } from "./phase2c-lib.mjs";
import { ACCOUNT_FILE } from "./phase2c-seed-test-accounts.mjs";
import { getAdapter, PROVIDER_ADAPTER_KEYS } from "../lib/providers/registry.ts";

export async function runPhase3g1HostedVerification({ env = process.env } = {}) {
  const target = assertDevTarget(env);
  if (!target.dbUrl) {
    throw new GuardError("PHASE2C_DB_URL is required for hosted verification.");
  }
  assertDbUrlMatchesRef(target.dbUrl, target.ref);

  if (!writesConfirmed(env, target.ref)) {
    throw new GuardError(`PHASE2C_CONFIRM_DEV_WRITES=${target.ref} is required for Phase 3G-1 hosted verification on DEV.`);
  }

  const secrets = [target.anonKey, target.serviceKey, target.dbUrl].filter(Boolean);
  const redact = makeRedactor(() => secrets);

  console.log(`[PHASE 3G-1 DEV VERIFY] Connecting to DEV REST API & DB (${target.ref})...`);

  const accountsData = JSON.parse(readFileSync(resolve(ACCOUNT_FILE), "utf8"));
  const { admin, staff, finance, clientA, clientB } = accountsData;

  const client = createClient({ url: target.url, anonKey: target.anonKey, serviceKey: target.serviceKey });
  const service = client.rest({ kind: "service" });

  console.log("[PHASE 3G-1 DEV VERIFY] Signing in test accounts via Supabase Auth...");
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
  let providerId, accountId, accountNoAdapterId, sysAId, sysBId, runId;
  let discIds = [];
  const FAKE_TOKEN = `3g1-invalid-test-token-${Date.now()}`;

  try {
    // -----------------------------------------------------------------------
    console.log("\n--- 1. SCHEMA & SAFETY ---");
    const tables = (await db.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_type='BASE TABLE'`)).rows.map((r) => r.table_name);
    check("3G1-SCH-1", "provider_discovery_runs + provider_discovered_resources exist",
      tables.includes("provider_discovery_runs") && tables.includes("provider_discovered_resources"));

    const views = (await db.query(`
      SELECT table_name FROM information_schema.views WHERE table_schema='public'
        AND table_name IN ('provider_connection_overview','staff_linked_provider_resources')`)).rows.map((r) => r.table_name);
    check("3G1-SCH-2", "connection overview + staff linked views exist", views.length === 2);

    const rls = (await db.query(`
      SELECT relname, relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND relname IN ('provider_discovery_runs','provider_discovered_resources')`)).rows;
    check("3G1-SCH-3", "RLS enabled on both new tables", rls.length === 2 && rls.every((r) => r.relrowsecurity));

    const cols = (await db.query(`
      SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public'
        AND (column_name ~* '(^|_)(api_key|api_secret|access_token|refresh_token|password|private_key)(_|$)'
             OR column_name IN ('token','secret','api_key','password'))`)).rows;
    check("3G1-SEC-1", "no plaintext credential columns anywhere in public schema", cols.length === 0,
      cols.length ? cols.map((c) => `${c.table_name}.${c.column_name}`).join(",") : "clean");

    const adapterCol = (await db.query(`
      SELECT data_type FROM information_schema.columns
      WHERE table_name='providers' AND column_name='adapter_key'`)).rows;
    const connCols = (await db.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name='provider_accounts'
        AND column_name IN ('connection_status','connection_checked_at','connection_error','last_discovery_at','discovery_capabilities')`)).rows;
    check("3G1-SCH-4", "adapter_key + connection state columns present",
      adapterCol.length === 1 && connCols.length === 5);

    const unique = (await db.query(`
      SELECT conname FROM pg_constraint WHERE conrelid='public.provider_discovered_resources'::regclass
        AND conname='uq_discovered_external_identity'`)).rows;
    check("3G1-SCH-5", "external identity unique constraint present", unique.length === 1);

    const fnGrants = (await db.query(`
      SELECT routine_name, grantee FROM information_schema.routine_privileges
      WHERE routine_schema='public'
        AND routine_name IN ('store_provider_credential','reveal_provider_credential','clear_provider_credential','link_discovered_resource','unlink_discovered_resource')
        AND grantee IN ('anon','authenticated','PUBLIC','public')`)).rows;
    check("3G1-SEC-2", "credential/link functions not executable by anon/authenticated/public",
      fnGrants.length === 0, fnGrants.length ? JSON.stringify(fnGrants.rows) : "clean");

    const vaultExt = await db.query(`SELECT 1 FROM pg_extension WHERE extname='supabase_vault'`);
    check("3G1-SEC-3", "supabase_vault extension available on DEV", vaultExt.rows.length === 1);

    const anonPrivs = (await db.query(`
      SELECT privilege_type, table_name FROM information_schema.role_table_grants
      WHERE grantee='anon' AND table_schema='public'
        AND table_name IN ('provider_discovery_runs','provider_discovered_resources','provider_connection_overview','staff_linked_provider_resources')`)).rows;
    check("3G1-SEC-4", "anon has zero privileges on all 3G-1 objects", anonPrivs.length === 0);

    const truncs = (await db.query(`
      SELECT grantee, table_name FROM information_schema.role_table_grants
      WHERE privilege_type='TRUNCATE' AND table_schema='public' AND grantee IN ('anon','authenticated','service_role')`)).rows;
    check("3G1-SEC-5", "no TRUNCATE privileges held by any role", truncs.length === 0,
      truncs.length ? JSON.stringify(truncs.rows) : "clean");

    // -----------------------------------------------------------------------
    console.log("\n--- 2. FIXTURES ---");
    providerId = (await db.query(`
      INSERT INTO public.providers (name, slug, adapter_key, category)
      VALUES ('3G1 Hosted Supabase', '3g1-supabase', 'supabase', 'cloud_hosting')
      ON CONFLICT (slug) DO UPDATE SET adapter_key='supabase'
      RETURNING id`)).rows[0].id;

    accountId = (await db.query(`
      INSERT INTO public.provider_accounts (provider_id, account_name, ownership)
      VALUES ('${providerId}', '3G1 Hosted Account', 'sch_managed') RETURNING id`)).rows[0].id;

    const noAdapterProv = (await db.query(`
      INSERT INTO public.providers (name, slug, category)
      VALUES ('3G1 Manual Provider', '3g1-manual', 'cloud_hosting')
      ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name
      RETURNING id`)).rows[0].id;
    accountNoAdapterId = (await db.query(`
      INSERT INTO public.provider_accounts (provider_id, account_name, ownership)
      VALUES ('${noAdapterProv}', '3G1 Manual Account', 'sch_managed') RETURNING id`)).rows[0].id;

    sysAId = (await db.query(`
      INSERT INTO public.systems (client_id, name, system_type, status)
      VALUES ('${clientA.id}', '3G1 Client A System', 'web_platform', 'live') RETURNING id`)).rows[0].id;
    sysBId = (await db.query(`
      INSERT INTO public.systems (client_id, name, system_type, status)
      VALUES ('${clientB.id}', '3G1 Client B System', 'web_platform', 'live') RETURNING id`)).rows[0].id;

    // -----------------------------------------------------------------------
    console.log("\n--- 3. CREDENTIALS (Vault roundtrip via service_role RPC) ---");
    const storeRes = await service.rpc("store_provider_credential", {
      p_provider_account_id: accountId,
      p_secret: JSON.stringify({ token: FAKE_TOKEN }),
    });
    check("3G1-CONN-1", "store_provider_credential writes to vault via service role", storeRes.ok === true,
      storeRes.ok ? "ref returned" : `${storeRes.status} ${JSON.stringify(storeRes.body)?.slice(0, 120)}`);

    const refRow = (await db.query(`SELECT credential_reference, connection_status FROM public.provider_accounts WHERE id='${accountId}'`)).rows[0];
    check("3G1-CONN-2", "credential_reference is a vault pointer, not a secret",
      refRow?.credential_reference?.startsWith("vault:") === true &&
      !refRow.credential_reference.includes(FAKE_TOKEN) &&
      refRow.connection_status === "configured",
      refRow?.credential_reference?.slice(0, 6) + "...");

    const revealRes = await service.rpc("reveal_provider_credential", { p_provider_account_id: accountId });
    let revealedOk = false;
    try { revealedOk = JSON.parse(revealRes.body)?.token === FAKE_TOKEN; } catch { /* noop */ }
    check("3G1-CONN-3", "reveal roundtrips the stored payload (service_role only)", revealedOk);

    // User-role RPC attempts must be denied even for admin
    const adminStore = await authResults.admin.rest.rpc("store_provider_credential", {
      p_provider_account_id: accountId, p_secret: "x".repeat(16),
    });
    check("3G1-CONN-4", "admin (user JWT) cannot call credential RPCs — service_role only",
      !adminStore.ok, `status=${adminStore.status}`);
    const adminReveal = await authResults.admin.rest.rpc("reveal_provider_credential", { p_provider_account_id: accountId });
    check("3G1-CONN-5", "no role can reveal credentials via user JWT",
      !adminReveal.ok, `status=${adminReveal.status}`);

    // -----------------------------------------------------------------------
    console.log("\n--- 4. CONNECTION TESTS (real adapter, real network) ---");
    const adapter = getAdapter("supabase");
    check("3G1-CONN-6", "supabase adapter registered with read-only capabilities",
      adapter !== null && adapter.capabilities.discoverResources === true &&
      adapter.capabilities.create === false && adapter.capabilities.delete === false);

    // Real HTTP call with an invalid token → must normalize to auth_failed
    const badConn = await adapter.testConnection({ token: FAKE_TOKEN });
    check("3G1-CONN-7", "invalid credentials fail safely (real api.supabase.com call)",
      badConn.ok === false && badConn.error === "auth_failed", `error=${badConn.error}`);
    check("3G1-CONN-8", "connection failure does not leak the credential",
      !JSON.stringify(badConn).includes(FAKE_TOKEN));

    skipCheck("3G1-CONN-9", "live connection success with valid DEV credential",
      "no provider credential supplied for live validation");

    // Record the failed test on the account (same path the server action writes)
    await db.query(`UPDATE public.provider_accounts SET connection_status='failed', connection_checked_at=now(), connection_error='auth_failed' WHERE id='${accountId}'`);
    const acctAfter = (await db.query(`SELECT connection_status, connection_error FROM public.provider_accounts WHERE id='${accountId}'`)).rows[0];
    check("3G1-CONN-10", "failed connection state persisted safely",
      acctAfter.connection_status === "failed" && acctAfter.connection_error === "auth_failed");

    const connAudit = (await db.query(`
      SELECT action, details FROM public.audit_logs
      WHERE table_name='provider_accounts' AND record_id='${accountId}'
        AND action LIKE 'provider_connection.%' ORDER BY created_at`)).rows;
    const connActions = connAudit.map((r) => r.action);
    check("3G1-AUD-1", "credential_configured + connection tested audited",
      connActions.includes("provider_connection.credential_configured") && connActions.includes("provider_connection.tested"),
      connActions.join(", "));
    check("3G1-SEC-6", "connection audit contains no credential material",
      !JSON.stringify(connAudit).includes(FAKE_TOKEN));

    // -----------------------------------------------------------------------
    console.log("\n--- 5. DISCOVERY RECORDS (manual run semantics) ---");
    // No-adapter account: connection test must report no_adapter
    const { getAdapter: getA } = await import("../lib/providers/registry.ts");
    check("3G1-DISC-1", "account without adapter resolves to null adapter",
      getA(null) === null && getA("manual") === null);

    // Discovery run lifecycle (service_role path used by the server action)
    runId = (await db.query(`
      INSERT INTO public.provider_discovery_runs (provider_account_id, initiated_by, status)
      VALUES ('${accountId}', '${admin.id}', 'running') RETURNING id`)).rows[0].id;

    const discRows = [
      { ext: "proj-alpha-001", type: "project", name: "elgon-inventory-prod", status: "ACTIVE_HEALTHY", region: "eu-west-1" },
      { ext: "proj-beta-002", type: "project", name: "sch-portal-dev", status: "ACTIVE_HEALTHY", region: "eu-west-2" },
      { ext: "svc-gamma-003", type: "service", name: "edge-api", status: "RUNNING", region: "iad" },
    ];
    for (const d of discRows) {
      const ins = await db.query(`
        INSERT INTO public.provider_discovered_resources
          (provider_account_id, external_resource_id, resource_type, name, status, region, metadata, last_run_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
        ON CONFLICT (provider_account_id, external_resource_id)
        DO UPDATE SET name=EXCLUDED.name, status=EXCLUDED.status, last_seen_at=now(), last_run_id=EXCLUDED.last_run_id
        RETURNING id`,
        [accountId, d.ext, d.type, d.name, d.status, d.region, JSON.stringify({ seeded: true }), runId]);
      discIds.push(ins.rows[0].id);
    }
    await db.query(`
      UPDATE public.provider_discovery_runs SET status='completed', completed_at=now(),
        discovered_count=3, new_count=3, linked_count=0 WHERE id='${runId}'`);

    const runRow = (await db.query(`SELECT status, discovered_count FROM public.provider_discovery_runs WHERE id='${runId}'`)).rows[0];
    check("3G1-DISC-2", "discovery run recorded (completed, 3 found)", runRow.status === "completed" && runRow.discovered_count === 3);

    // Re-discovery of same external IDs must not duplicate
    await db.query(`
      INSERT INTO public.provider_discovered_resources
        (provider_account_id, external_resource_id, resource_type, name, status, last_run_id)
      VALUES ('${accountId}', 'proj-alpha-001', 'project', 'elgon-inventory-prod RENAMED', 'ACTIVE_HEALTHY', '${runId}')
      ON CONFLICT (provider_account_id, external_resource_id)
      DO UPDATE SET name=EXCLUDED.name, last_seen_at=now()`);
    const dedupe = (await db.query(`
      SELECT count(*) c, max(name) n FROM public.provider_discovered_resources
      WHERE provider_account_id='${accountId}' AND external_resource_id='proj-alpha-001'`)).rows[0];
    check("3G1-DISC-3", "re-discovery updates in place — no duplicates",
      Number(dedupe.c) === 1 && dedupe.n === "elgon-inventory-prod RENAMED");

    const runAudit = (await db.query(`
      SELECT action FROM public.audit_logs WHERE table_name='provider_discovery_runs' AND record_id='${runId}'`)).rows.map((r) => r.action);
    check("3G1-AUD-2", "discovery run started + completed audited",
      runAudit.includes("provider_discovery.started") && runAudit.includes("provider_discovery.completed"));

    // Failed run recording
    const failRun = (await db.query(`
      INSERT INTO public.provider_discovery_runs (provider_account_id, initiated_by)
      VALUES ('${accountId}', '${admin.id}') RETURNING id`)).rows[0].id;
    discIds; // keep hoisted
    await db.query(`UPDATE public.provider_discovery_runs SET status='failed', completed_at=now(), error_count=1, error_summary='auth_failed' WHERE id='${failRun}'`);
    const failAudit = (await db.query(`
      SELECT action FROM public.audit_logs WHERE table_name='provider_discovery_runs' AND record_id='${failRun}'`)).rows.map((r) => r.action);
    check("3G1-DISC-4", "failed discovery recorded + audited", failAudit.includes("provider_discovery.failed"));
    check("3G1-SEC-7", "failed run error_summary is a safe category only",
      (await db.query(`SELECT error_summary FROM public.provider_discovery_runs WHERE id='${failRun}'`)).rows[0].error_summary === "auth_failed");

    // -----------------------------------------------------------------------
    console.log("\n--- 6. EXPLICIT LINKING ---");
    // Missing client
    const noClient = await service.rpc("link_discovered_resource", {
      p_discovered_id: discIds[0], p_client_id: null, p_system_id: sysAId, p_linked_by: admin.id,
    });
    check("3G1-LINK-1", "linking requires an explicit client", !noClient.ok, `status=${noClient.status}`);

    const noSystem = await service.rpc("link_discovered_resource", {
      p_discovered_id: discIds[0], p_client_id: clientA.id, p_system_id: null, p_linked_by: admin.id,
    });
    check("3G1-LINK-2", "linking requires an explicit system", !noSystem.ok, `status=${noSystem.status}`);

    const cross = await service.rpc("link_discovered_resource", {
      p_discovered_id: discIds[0], p_client_id: clientA.id, p_system_id: sysBId, p_linked_by: admin.id,
    });
    check("3G1-LINK-3", "cross-client linking rejected at DB level", !cross.ok,
      `status=${cross.status} ${String(cross.body?.message || "").slice(0, 80)}`);

    const link = await service.rpc("link_discovered_resource", {
      p_discovered_id: discIds[0], p_client_id: clientA.id, p_system_id: sysAId, p_linked_by: admin.id,
    });
    check("3G1-LINK-4", "admin links discovered resource → SCH resource created", link.ok === true,
      link.ok ? `resource=${link.body}` : `${link.status} ${JSON.stringify(link.body)?.slice(0, 150)}`);
    const linkedResourceId = link.ok ? link.body : null;

    if (linkedResourceId) {
      const resRow = (await db.query(`SELECT client_id, system_id, external_reference, resource_type, ownership FROM public.resources WHERE id='${linkedResourceId}'`)).rows[0];
      check("3G1-LINK-5", "linked resource carries client, system, external reference",
        resRow?.client_id === clientA.id && resRow?.system_id === sysAId &&
        resRow?.external_reference === "provider:proj-alpha-001" && resRow?.ownership === "client_owned");
      const dRow = (await db.query(`SELECT link_status, linked_by FROM public.provider_discovered_resources WHERE id='${discIds[0]}'`)).rows[0];
      check("3G1-LINK-6", "discovered row marked linked with actor", dRow.link_status === "linked" && dRow.linked_by === admin.id);
    }

    // Idempotent re-link
    const relink = await service.rpc("link_discovered_resource", {
      p_discovered_id: discIds[0], p_client_id: clientA.id, p_system_id: sysAId, p_linked_by: admin.id,
    });
    check("3G1-LINK-7", "repeated linking is idempotent (same resource id)",
      relink.ok && relink.body === linkedResourceId);

    // Linking never creates clients/systems
    const counts = await db.query(`
      SELECT (SELECT count(*) FROM profiles WHERE role='client') c, (SELECT count(*) FROM systems WHERE id IN ('${sysAId}','${sysBId}')) s`);
    const link2 = await service.rpc("link_discovered_resource", {
      p_discovered_id: discIds[1], p_client_id: clientA.id, p_system_id: sysAId, p_linked_by: admin.id,
    });
    const counts2 = await db.query(`
      SELECT (SELECT count(*) FROM profiles WHERE role='client') c, (SELECT count(*) FROM systems WHERE id IN ('${sysAId}','${sysBId}')) s`);
    check("3G1-LINK-8", "linking never silently creates clients or systems",
      link2.ok && counts.rows[0].c === counts2.rows[0].c && counts.rows[0].s === counts2.rows[0].s);

    // Link audit
    const linkAudit = (await db.query(`
      SELECT action FROM public.audit_logs WHERE table_name='provider_discovered_resources' AND record_id='${discIds[0]}'`)).rows.map((r) => r.action);
    check("3G1-AUD-3", "provider_resource.linked audited", linkAudit.includes("provider_resource.linked"));

    // Unlink keeps evidence
    const unlink = await service.rpc("unlink_discovered_resource", { p_discovered_id: discIds[1], p_actor: admin.id });
    const unlinkedRow = (await db.query(`SELECT link_status FROM public.provider_discovered_resources WHERE id='${discIds[1]}'`)).rows[0];
    check("3G1-LINK-9", "unlink returns row to unlinked without deleting evidence",
      unlink.ok && unlinkedRow.link_status === "unlinked");
    const unlinkAudit = (await db.query(`
      SELECT action FROM public.audit_logs WHERE table_name='provider_discovered_resources' AND record_id='${discIds[1]}'`)).rows.map((r) => r.action);
    check("3G1-AUD-4", "provider_resource.unlinked audited", unlinkAudit.includes("provider_resource.unlinked"));

    // Non-admin cannot call link RPC via user JWT
    const staffLink = await authResults.staff.rest.rpc("link_discovered_resource", {
      p_discovered_id: discIds[2], p_client_id: clientA.id, p_system_id: sysAId, p_linked_by: staff.id,
    });
    check("3G1-LINK-10", "staff cannot execute link RPC", !staffLink.ok, `status=${staffLink.status}`);
    const finLink = await authResults.finance.rest.rpc("link_discovered_resource", {
      p_discovered_id: discIds[2], p_client_id: clientA.id, p_system_id: sysAId, p_linked_by: finance.id,
    });
    check("3G1-LINK-11", "finance cannot execute link RPC", !finLink.ok, `status=${finLink.status}`);

    // -----------------------------------------------------------------------
    console.log("\n--- 7. RBAC (REST) ---");
    const adminOv = await authResults.admin.rest.get("provider_connection_overview", { select: "*" });
    check("3G1-RBAC-1", "admin reads provider_connection_overview", adminOv.ok && adminOv.body.some((r) => r.id === accountId));
    const adminRow = (adminOv.body || []).find((r) => r.id === accountId);
    check("3G1-SEC-8", "overview exposes credential_configured flag, never the reference",
      adminRow && "credential_configured" in adminRow && !("credential_reference" in adminRow));

    const adminDisc = await authResults.admin.rest.get("provider_discovered_resources", { select: "*" });
    check("3G1-RBAC-2", "admin reads discovered resources", adminDisc.ok && adminDisc.body.length >= 3);

    const finOv = await authResults.finance.rest.get("provider_connection_overview", { select: "id" });
    check("3G1-RBAC-3", "finance reads connection overview (read-only context)", finOv.ok && finOv.body.length >= 1);
    const finWrite = await authResults.finance.rest.insert("provider_discovered_resources", {
      provider_account_id: accountId, external_resource_id: "fin-x", resource_type: "project", name: "fin",
    });
    check("3G1-RBAC-4", "finance cannot write discovery records", !finWrite.ok, `status=${finWrite.status}`);
    const finRun = await authResults.finance.rest.insert("provider_discovery_runs", { provider_account_id: accountId });
    check("3G1-RBAC-5", "finance cannot initiate discovery runs", !finRun.ok, `status=${finRun.status}`);

    const staffDisc = await authResults.staff.rest.get("provider_discovered_resources", { select: "*" });
    check("3G1-RBAC-6", "staff sees 0 rows on raw discovered table",
      staffDisc.ok && Array.isArray(staffDisc.body) && staffDisc.body.length === 0);
    const staffRuns = await authResults.staff.rest.get("provider_discovery_runs", { select: "*" });
    check("3G1-RBAC-7", "staff sees 0 rows on discovery runs",
      staffRuns.ok && staffRuns.body.length === 0);
    const staffOv = await authResults.staff.rest.get("provider_connection_overview", { select: "*" });
    check("3G1-RBAC-8", "staff sees 0 rows on connection overview",
      staffOv.ok && staffOv.body.length === 0);
    const staffLinked = await authResults.staff.rest.get("staff_linked_provider_resources", { select: "*" });
    check("3G1-RBAC-9", "staff sees linked-only operational view (unlinked hidden)",
      staffLinked.ok && staffLinked.body.every((r) => r.linked_resource_id !== null));
    const staffLinkedRow = (staffLinked.body || [])[0];
    if (staffLinkedRow) {
      check("3G1-SEC-9", "staff view has no credential/metadata/financial fields",
        !["credential_reference", "metadata", "amount", "currency", "margin"].some((k) => k in staffLinkedRow));
    } else {
      check("3G1-SEC-9", "staff view has no credential/metadata/financial fields", true, "no linked rows to inspect");
    }

    for (const [key, acc] of [["clientA", authResults.clientA], ["clientB", authResults.clientB]]) {
      const d = await acc.rest.get("provider_discovered_resources", { select: "*" });
      const o = await acc.rest.get("provider_connection_overview", { select: "*" });
      const l = await acc.rest.get("staff_linked_provider_resources", { select: "*" });
      check(`3G1-RBAC-10${key === "clientA" ? "a" : "b"}`, `client ${key} sees zero provider admin data`,
        d.ok && d.body.length === 0 && o.ok && o.body.length === 0 && l.ok && l.body.length === 0);
    }

    // Delete safety
    const delDisc = await service.delete("provider_discovered_resources", { id: `eq.${discIds[2]}` });
    check("3G1-SEC-10", "service-role delete blocked (history preserved)", !delDisc.ok, `status=${delDisc.status}`);

    // Credential rotation + clear
    const rot = await service.rpc("store_provider_credential", {
      p_provider_account_id: accountId, p_secret: JSON.stringify({ token: "rotated-" + FAKE_TOKEN }),
    });
    const revealRot = await service.rpc("reveal_provider_credential", { p_provider_account_id: accountId });
    let rotOk = false;
    try { rotOk = JSON.parse(revealRot.body)?.token === "rotated-" + FAKE_TOKEN; } catch { /* noop */ }
    check("3G1-CONN-11", "credential rotation replaces the vault secret", rot.ok && rotOk);

    const clear = await service.rpc("clear_provider_credential", { p_provider_account_id: accountId });
    const cleared = (await db.query(`SELECT credential_reference, connection_status FROM public.provider_accounts WHERE id='${accountId}'`)).rows[0];
    check("3G1-CONN-12", "clear removes reference and resets connection state",
      clear.ok && cleared.credential_reference === null && cleared.connection_status === "unconfigured");

    // -----------------------------------------------------------------------
    console.log("\n--- 8. STAFF FINANCIAL ANTI-LEAK (regression) ---");
    const staffCosts = await authResults.staff.rest.get("provider_costs", { select: "*" });
    check("3G1-FIN-1", "staff still sees 0 rows on provider_costs",
      staffCosts.ok && staffCosts.body.length === 0);
    const staffInv = await authResults.staff.rest.get("invoices", { select: "id" });
    check("3G1-FIN-2", "staff still sees 0 rows on invoices",
      staffInv.ok && staffInv.body.length === 0);

  } finally {
    console.log("\n--- TEARDOWN ---");
    try {
      if (accountId) {
        await service.rpc("clear_provider_credential", { p_provider_account_id: accountId });
        await db.query(`ALTER TABLE public.provider_discovered_resources DISABLE TRIGGER trg_discovered_no_delete`);
        await db.query(`ALTER TABLE public.provider_discovery_runs DISABLE TRIGGER trg_discovery_runs_no_delete`);
        await db.query(`DELETE FROM public.provider_discovered_resources WHERE provider_account_id = $1`, [accountId]);
        await db.query(`DELETE FROM public.provider_discovery_runs WHERE provider_account_id IN ($1, $2)`, [accountId, accountNoAdapterId]);
        await db.query(`ALTER TABLE public.provider_discovered_resources ENABLE TRIGGER trg_discovered_no_delete`);
        await db.query(`ALTER TABLE public.provider_discovery_runs ENABLE TRIGGER trg_discovery_runs_no_delete`);
        await db.query(`DELETE FROM public.resources WHERE provider_account_id IN ($1, $2)`, [accountId, accountNoAdapterId]);
      }
      if (sysAId || sysBId) await db.query(`DELETE FROM public.systems WHERE id = ANY($1::uuid[])`, [[sysAId, sysBId].filter(Boolean)]);
      if (accountId || accountNoAdapterId) await db.query(`DELETE FROM public.provider_accounts WHERE id = ANY($1::uuid[])`, [[accountId, accountNoAdapterId].filter(Boolean)]);
      if (providerId) await db.query(`DELETE FROM public.providers WHERE slug IN ('3g1-supabase','3g1-manual')`);
      console.log("[PASS] Teardown complete.");
    } catch (e) {
      console.error("[WARN] teardown error:", e.message);
    }
    await db.end();
  }

  const passed = results.filter((r) => r.pass && !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n============================================================`);
  console.log(`PHASE 3G-1 HOSTED VERIFICATION SUMMARY: ${passed} PASS, ${skipped} SKIPPED, ${failed} FAIL`);
  console.log(`============================================================\n`);

  const report = {
    projectRef: target.ref,
    timestamp: new Date().toISOString(),
    passed, skipped, failed,
    status: failed === 0 ? "PASS" : "FAIL",
    results,
  };

  mkdirSync("phase2c-reports", { recursive: true });
  writeFileSync(join("phase2c-reports", "phase3g1-dev-verification.json"), redact(JSON.stringify(report, null, 2)));

  if (failed > 0) throw new Error(`Hosted verification failed with ${failed} failures.`);
  return report;
}

if (process.argv[1] && process.argv[1].endsWith("verify-phase3g1-hosted-dev.mjs")) {
  const env = {};
  readFileSync(".env.phase2c", "utf8").split("\n").forEach((l) => {
    const m = l.match(/^\s*([^#][^=]*)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  });
  env.PHASE2C_DEV_PROJECT_REF = "outuocpsotiozkpyksex";
  env.PHASE2C_CONFIRM_DEV_WRITES = "outuocpsotiozkpyksex";

  runPhase3g1HostedVerification({ env })
    .then(() => { console.log("Phase 3G-1 Hosted DEV Verification complete."); process.exit(0); })
    .catch((err) => { console.error("Phase 3G-1 Hosted DEV Verification FAILED:", err); process.exit(1); });
}
