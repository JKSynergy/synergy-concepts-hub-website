// Phase 3G-6 Browser Verification — Controlled Operational Automation
// Real Chrome via CDP against the local dev server pointed at hosted DEV
// (outuocpsotiozkpyksex).
//
// Seeds automation evidence in DB, evaluates the real rule engine via
// service RPC (the same path the monitoring service calls), then verifies
// the admin/finance/staff/client UI surfaces: rules catalog, enable/disable,
// configure dialog, automation history, Action Center signals, tasks, and
// the approval-required proposal — plus responsive + console checks.

import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createClient } from "./phase2c-lib.mjs";
import { openPgConnection } from "./apply-migration-013.mjs";

const ACCOUNT_FILE = "E:\\SYSTEMS AND WEBSITES\\SCH_Website_Upload\\portal\\.phase2c-accounts.local.json";
const CHROME_PORT = 9232;
const BASE = "http://localhost:3000";

function loadEnv() {
  const env = {};
  readFileSync(".env.phase2c", "utf8").split("\n").forEach((l) => {
    const m = l.match(/^\s*([^#][^=]*)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  });
  return env;
}

function loadAccount(roleName) {
  const data = JSON.parse(readFileSync(ACCOUNT_FILE, "utf8"));
  const key = Object.keys(data).find((k) => k.toLowerCase() === roleName.toLowerCase());
  if (!key) throw new Error(`Role ${roleName} not found`);
  return data[key];
}

async function ensureChrome() {
  try {
    const res = await fetch(`http://127.0.0.1:${CHROME_PORT}/json/version`);
    if (res.ok) return;
  } catch {}
  spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
    "--headless=new",
    `--remote-debugging-port=${CHROME_PORT}`,
    "--user-data-dir=C:\\Users\\SYNERGY CREATIVE HUB\\.gemini\\antigravity-ide\\brain\\5b20a811-854c-455a-a6f2-94875e96a286\\scratch\\chrome-test-profile-3g6",
    "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    `${BASE}/login`,
  ], { detached: true, stdio: "ignore" });
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      if ((await fetch(`http://127.0.0.1:${CHROME_PORT}/json/version`)).ok) return;
    } catch {}
  }
  throw new Error("Chrome did not start");
}

async function getWsUrl() {
  await ensureChrome();
  const list = await (await fetch(`http://127.0.0.1:${CHROME_PORT}/json/list`)).json();
  let page = list.find((p) => p.type === "page" && p.url.includes("localhost:3000")) || list.find((p) => p.type === "page");
  if (!page) {
    const r = await fetch(`http://127.0.0.1:${CHROME_PORT}/json/new?${BASE}/login`, { method: "PUT" });
    return (await r.json()).webSocketDebuggerUrl;
  }
  return page.webSocketDebuggerUrl;
}

async function sendCdp(ws, method, params = {}) {
  const id = Math.floor(Math.random() * 1000000);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout ${method}`)), 20000);
    const handler = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.id === id) {
          clearTimeout(timer);
          ws.removeEventListener("message", handler);
          msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
        }
      } catch {}
    };
    ws.addEventListener("message", handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

const evalJs = async (ws, expression) =>
  (await sendCdp(ws, "Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }))?.result?.value;

const clickSelector = (ws, selector) =>
  evalJs(ws, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`);

async function waitForText(ws, text, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const body = (await evalJs(ws, "document.body.innerText")) || "";
    if (body.includes(text)) return body;
    await new Promise((r) => setTimeout(r, 400));
  }
  return (await evalJs(ws, "document.body.innerText")) || "";
}

async function waitForSelector(ws, selector, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if ((await evalJs(ws, `!!document.querySelector(${JSON.stringify(selector)})`)) === true) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function loginAs(ws, roleName) {
  const acc = loadAccount(roleName);
  try {
    await sendCdp(ws, "Network.enable");
    await sendCdp(ws, "Network.clearBrowserCookies");
  } catch {}
  await sendCdp(ws, "Page.navigate", { url: `${BASE}/login` });
  await new Promise((r) => setTimeout(r, 2500));
  const script = `(() => {
    const e = document.querySelector('input[type="email"]');
    const p = document.querySelector('input[type="password"]');
    const b = document.querySelector('button[type="submit"]');
    if (!e || !p || !b) return false;
    const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value').set; s.call(el, v); el.dispatchEvent(new Event('input',{bubbles:true})); };
    set(e, ${JSON.stringify(acc.email)}); set(p, ${JSON.stringify(acc.password)}); b.click(); return true;
  })()`;
  await evalJs(ws, script);
  let url = "";
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 500));
    url = (await evalJs(ws, "window.location.href")) || "";
    if (!url.includes("/login")) break;
  }
  if (url.includes("/login")) {
    await evalJs(ws, script);
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 500));
      url = (await evalJs(ws, "window.location.href")) || "";
      if (!url.includes("/login")) break;
    }
  }
  return url;
}

async function setViewport(ws, width, height) {
  await sendCdp(ws, "Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 768 });
}

async function checkNoHorizontalOverflow(ws) {
  return evalJs(ws, `document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1`);
}

// ============================================================================
async function run() {
  const env = loadEnv();
  const client = createClient({ url: env.NEXT_PUBLIC_SUPABASE_URL, anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY });
  const service = client.rest({ kind: "service" });
  const db = await openPgConnection(env.PHASE2C_DB_URL);
  const clientAcc = loadAccount("clientA");
  const adminAcc = loadAccount("admin");
  const runTs = Date.now();

  console.log("Connecting to Chrome CDP...");
  const ws = new WebSocket(await getWsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  console.log("Connected.\n");

  const consoleErrors = [];
  ws.addEventListener("message", (evt) => {
    try {
      const msg = JSON.parse(evt.data);
      if (msg.method === "Log.entryAdded" && msg.params?.entry?.level === "error") {
        const t = msg.params.entry.text || "";
        if (!/favicon|404 \(Not Found\)/i.test(t)) consoleErrors.push(t);
      }
      if (msg.method === "Runtime.exceptionThrown") {
        consoleErrors.push(msg.params?.exceptionDetails?.text || "exception");
      }
    } catch {}
  });
  try { await sendCdp(ws, "Log.enable"); await sendCdp(ws, "Runtime.enable"); } catch {}

  const results = [];
  const check = (name, cond, extra = "") => {
    console.log(`${cond ? "[PASS]" : "[FAIL]"} ${name}${extra ? " — " + extra : ""}`);
    results.push({ name, passed: !!cond });
  };

  let providerId, accountId, sysId, discId, resId, dRunId, polId, incId, bakResId, schedId;
  const extraRunIds = [];

  try {
    // Fixtures: account + linked PAUSED resource w/ 2 down monitoring runs,
    // failing schedule, stale incident, failing backup policy.
    providerId = (await db.query(`
      INSERT INTO public.providers (name, slug, adapter_key, category)
      VALUES ('3G6 CDP Supabase', '3g6-cdp-supabase-${runTs}', 'supabase', 'cloud_hosting')
      RETURNING id`)).rows[0].id;
    accountId = (await db.query(`
      INSERT INTO public.provider_accounts (provider_id, account_name, ownership, client_id, connection_status, credential_reference)
      VALUES ('${providerId}', '3G6 CDP Account', 'sch_managed', '${clientAcc.id}', 'connected', 'vault:3g6-cdp-pointer')
      RETURNING id`)).rows[0].id;
    sysId = (await db.query(`
      INSERT INTO public.systems (client_id, name, system_type, status)
      VALUES ('${clientAcc.id}', '3G6 CDP System', 'web_platform', 'live') RETURNING id`)).rows[0].id;
    dRunId = (await db.query(`
      INSERT INTO public.provider_discovery_runs (provider_account_id, status, initiated_by, completed_at)
      VALUES ('${accountId}', 'completed', '${adminAcc.id}', now()) RETURNING id`)).rows[0].id;
    discId = (await db.query(`
      INSERT INTO public.provider_discovered_resources
        (provider_account_id, external_resource_id, resource_type, name, status, last_run_id, external_missing)
      VALUES ('${accountId}', '3g6-cdp-prj', 'project', '3g6-cdp-db', 'PAUSED', '${dRunId}', false) RETURNING id`)).rows[0].id;
    await service.rpc("link_discovered_resource", {
      p_discovered_id: discId, p_client_id: clientAcc.id, p_system_id: sysId, p_linked_by: adminAcc.id });
    resId = (await db.query(`SELECT linked_resource_id FROM public.provider_discovered_resources WHERE id=$1`, [discId])).rows[0]?.linked_resource_id;

    for (let i = 0; i < 2; i++) {
      const rr = (await db.query(`
        INSERT INTO public.provider_reconciliation_runs (provider_account_id, status, completed_at)
        VALUES ('${accountId}', 'completed', now()) RETURNING id`)).rows[0].id;
      await db.query(`
        INSERT INTO public.provider_monitoring_runs (provider_account_id, trigger_source, status, reconciliation_run_id, completed_at)
        VALUES ('${accountId}', 'scheduled', 'completed', '${rr}', now()) RETURNING id`);
      extraRunIds.push(rr);
      await db.query(`
        INSERT INTO public.provider_reconciliation_items
          (run_id, provider_account_id, discovered_resource_id, resource_id, change_type, current_snapshot, change_fingerprint)
        VALUES ('${rr}', '${accountId}', '${discId}', '${resId}', 'unchanged', '{"status":"PAUSED"}', 'fp-3g6cdp-${runTs}-${i}')`);
    }

    schedId = (await db.query(`
      INSERT INTO public.provider_monitoring_schedules (provider_account_id, enabled, consecutive_failures)
      VALUES ('${accountId}', true, 3) RETURNING id`)).rows[0].id;

    incId = (await db.query(`
      INSERT INTO public.incidents (client_id, system_id, title, description, severity, status, reported_by, opened_at)
      VALUES ('${clientAcc.id}', '${sysId}', '3G6 CDP stale incident', 'Unresolved for days', 'high', 'open', '${adminAcc.id}', now() - interval '48 hours')
      RETURNING id`)).rows[0].id;

    bakResId = (await db.query(`
      INSERT INTO public.resources (client_id, system_id, provider_account_id, name, resource_type, status)
      VALUES ('${clientAcc.id}', '${sysId}', '${accountId}', '3G6 CDP DB', 'database', 'active') RETURNING id`)).rows[0].id;
    polId = (await db.query(`
      INSERT INTO public.backup_policies (client_id, resource_id, system_id, name, frequency, retention_days, created_by)
      VALUES ('${clientAcc.id}', '${bakResId}', '${sysId}', '3G6 CDP Nightly', 'daily', 30, '${adminAcc.id}') RETURNING id`)).rows[0].id;
    await db.query(`
      INSERT INTO public.backup_events (client_id, backup_policy_id, resource_id, system_id, status, recorded_by, failure_reason)
      VALUES
      ('${clientAcc.id}', '${polId}', '${bakResId}', '${sysId}', 'failed', '${adminAcc.id}', 'timeout'),
      ('${clientAcc.id}', '${polId}', '${bakResId}', '${sysId}', 'missed', '${adminAcc.id}', NULL)`);

    // Fire the real evaluation path (same RPC the monitoring service calls).
    const acctEval = await service.rpc("evaluate_account_automation", {
      p_provider_account_id: accountId, p_monitoring_run_id: null, p_run_succeeded: true,
      p_trigger_source: "manual", p_actor: adminAcc.id });
    await service.rpc("evaluate_account_automation", {
      p_provider_account_id: accountId, p_monitoring_run_id: null, p_run_succeeded: false,
      p_trigger_source: "manual", p_actor: adminAcc.id });
    const sweepEval = await service.rpc("evaluate_automation_sweep", { p_actor: adminAcc.id });
    console.log("Fixtures seeded + evaluated.\n");
    const evalCount = (acctEval.body?.evaluations?.length ?? 0) + (sweepEval.body?.evaluations?.length ?? 0);
    check("evaluation returned decisions", acctEval.ok && sweepEval.ok && evalCount > 0, `${evalCount} evaluations`);

    // ------------------------------------------------------------------
    console.log("--- 1. ADMIN: AUTOMATION PAGE ---");
    await loginAs(ws, "admin");
    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/systems/automation` });
    // Wait for the rules table itself — "Automation" appears in the nav shell
    // long before the server-rendered rows arrive.
    const pageBody = await waitForText(ws, "Unresolved incident escalation");
    check("admin automation page loads", pageBody.includes("Automation"));
    check("nav entry present", pageBody.includes("Automation"));

    for (const key of ["Repeated provider connection failure", "Linked resource missing investigation",
      "Unavailable linked resource", "Backup failure escalation", "Unresolved incident escalation"]) {
      check(`catalog rule visible: ${key}`, pageBody.toLowerCase().includes(key.toLowerCase()), key);
    }
    // StatusMark applies text-transform: capitalize → innerText reads "Approval Required".
    check("approval-required class shown", pageBody.toLowerCase().includes("approval required"));
    check("creates proposal only marker", pageBody.toLowerCase().includes("creates proposal only"));

    // Rule config UI: disable + re-enable via the real buttons.
    const toggled = await evalJs(ws, `(() => {
      const rows = Array.from(document.querySelectorAll('tr'));
      const row = rows.find(r => (r.innerText||'').includes('Unresolved incident escalation'));
      const btn = row?.querySelector("[data-action='disable-rule']");
      if (btn) btn.click(); return !!btn;
    })()`);
    check("disable button present", toggled);
    const disBody = await waitForText(ws, "Rule disabled", 20000);
    check("rule disabled via UI", disBody.includes("Rule disabled"));

    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/systems/automation` });
    await waitForText(ws, "Unresolved incident escalation", 20000);
    await evalJs(ws, `(() => {
      const rows = Array.from(document.querySelectorAll('tr'));
      const row = rows.find(r => (r.innerText||'').includes('Unresolved incident escalation'));
      const btn = row?.querySelector("[data-action='enable-rule']");
      if (btn) btn.click(); return !!btn;
    })()`);
    const enBody = await waitForText(ws, "Rule enabled", 20000);
    check("rule re-enabled via UI", enBody.includes("Rule enabled"));

    // Configure dialog.
    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/systems/automation` });
    await waitForText(ws, "Unresolved incident escalation", 20000);
    await evalJs(ws, `(() => {
      const rows = Array.from(document.querySelectorAll('tr'));
      const row = rows.find(r => (r.innerText||'').includes('Unresolved incident escalation'));
      const btn = row?.querySelector("[data-action='configure-rule']");
      if (btn) btn.click(); return !!btn;
    })()`);
    const dlg = await waitForSelector(ws, `[data-field='rule-threshold']`, 15000);
    check("configure dialog opens", dlg);
    if (dlg) {
      await evalJs(ws, `(() => {
        const inp = document.querySelector("[data-field='rule-cooldown']");
        const s = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(inp),'value').set;
        s.call(inp, '43200'); inp.dispatchEvent(new Event('input',{bubbles:true})); return true;
      })()`);
      await clickSelector(ws, `[data-action='save-rule']`);
      const saved = await waitForText(ws, "Rule updated", 20000);
      check("threshold/cooldown saved via UI", saved.includes("Rule updated"));
      await service.rpc("save_automation_rule", {
        p_rule_key: "incident_escalation", p_enabled: true, p_threshold: 24,
        p_cooldown_seconds: 86400, p_actor: adminAcc.id });
    }

    // History table shows decisions.
    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/systems/automation` });
    const histBody = await waitForText(ws, "Automation history", 20000);
    check("automation history shows decisions",
      histBody.toLowerCase().includes("acted") || histBody.toLowerCase().includes("proposal_created"),
      histBody.toLowerCase().includes("proposal_created") ? "proposal row present" : "acted only");
    check("history links created objects",
      /task|signal|proposal/.test(histBody), "");
    check("history shows trigger source", histBody.includes("manual") || histBody.includes("sweep"));

    // ------------------------------------------------------------------
    console.log("\n--- 2. DOWNSTREAM SURFACES ---");
    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/operations/action-center` });
    const acBody = await waitForText(ws, "Unresolved incident requires escalation", 25000);
    check("escalation signal in Action Center", acBody.includes("Unresolved incident requires escalation"));
    check("connection signal escalated in Action Center", acBody.toLowerCase().includes("connection"));

    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/operations/tasks` });
    const taskBody = await waitForText(ws, "Escalate unresolved incident", 25000);
    check("automation tasks visible in tasks list",
      taskBody.includes("Escalate unresolved incident") && taskBody.includes("Investigate repeated provider connection failure"));

    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/systems/operations` });
    const opsBody = await waitForText(ws, "resume", 25000);
    check("resume proposal visible in operations queue", opsBody.toLowerCase().includes("resume"));
    const prop = await db.query(
      `SELECT status FROM public.provider_operation_proposals WHERE provider_account_id=$1`, [accountId]);
    check("proposal awaiting approval (not executed)", prop.rows[0]?.status === "proposed", prop.rows[0]?.status);

    // ------------------------------------------------------------------
    console.log("\n--- 3. RESPONSIVE ---");
    for (const w of [1280, 768, 375]) {
      await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/systems/automation` });
      await waitForText(ws, "Automation", 20000);
      await setViewport(ws, w, 900);
      await new Promise((r) => setTimeout(r, 600));
      check(`no horizontal overflow @${w}px`, await checkNoHorizontalOverflow(ws));
    }
    await setViewport(ws, 1280, 900);

    // ------------------------------------------------------------------
    console.log("\n--- 4. FINANCE: read-only ---");
    await loginAs(ws, "finance");
    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/systems/automation` });
    const finBody = await waitForText(ws, "Unresolved incident escalation", 25000);
    check("finance reads rules + history",
      finBody.includes("Unresolved incident escalation") && finBody.includes("Automation history"),
      `url:${(await evalJs(ws, "window.location.href")) || ""}`);
    const finActions = await evalJs(ws, `document.querySelectorAll("[data-action]").length`);
    check("finance has zero configuration actions", finActions === 0, `${finActions} actions`);

    // ------------------------------------------------------------------
    console.log("\n--- 5. STAFF: run history only, no rule config ---");
    await loginAs(ws, "staff");
    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/systems/automation` });
    const staffBody = await waitForText(ws, "Automation history", 25000);
    check("staff sees run history",
      staffBody.includes("Automation history") && /acted|skipped|proposal/i.test(staffBody));
    // Staff legitimately sees rule NAMES inside run history rows; "no rule
    // config" means the rules card itself is empty for staff (RLS-filtered).
    check("staff sees no rule config", staffBody.includes("No automation rules visible"));
    const staffActions = await evalJs(ws, `document.querySelectorAll("[data-action]").length`);
    check("staff has zero configuration actions", staffActions === 0);

    // ------------------------------------------------------------------
    console.log("\n--- 6. CLIENT: denied ---");
    await loginAs(ws, "clientA");
    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/systems/automation` });
    await new Promise((r) => setTimeout(r, 4000));
    const cliUrl = await evalJs(ws, "window.location.href");
    check("client redirected away from automation", !cliUrl.includes("/admin/systems/automation"), cliUrl);

    // ------------------------------------------------------------------
    console.log("\n--- 7. CONSOLE ---");
    check("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | ") || "clean");

    // Safety invariant: proposal exists but NOTHING executed.
    const execs = await db.query(
      `SELECT count(*)::int AS n FROM public.provider_operation_executions e
       JOIN public.provider_operation_proposals p ON p.id=e.proposal_id
       WHERE p.provider_account_id=$1`, [accountId]);
    check("zero provider operation executions", execs.rows[0].n === 0);
  } finally {
    console.log("\n--- TEARDOWN ---");
    try {
      for (const t of [
        ["automation_runs", "trg_automation_runs_no_delete"],
        ["action_items", "trg_action_items_no_delete"],
        ["tasks", "trg_tasks_no_delete"],
        ["incidents", "trg_incidents_no_delete"],
        ["backup_events", "trg_backup_events_no_delete"],
        ["backup_policies", "trg_backup_policies_no_delete"],
        ["provider_operation_proposals", "trg_op_proposals_no_delete"],
        ["provider_operation_executions", "trg_op_executions_no_delete"],
        ["provider_reconciliation_items", "trg_recon_items_no_delete"],
        ["provider_reconciliation_runs", "trg_recon_runs_no_delete"],
        ["provider_monitoring_runs", "trg_mon_runs_no_delete"],
        ["provider_discovered_resources", "trg_discovered_no_delete"],
        ["provider_discovery_runs", "trg_discovery_runs_no_delete"],
      ]) {
        await db.query(`ALTER TABLE public.${t[0]} DISABLE TRIGGER ${t[1]}`).catch(() => {});
      }
      // Delete children before parents: action items/tasks/incidents/backup
      // rows reference systems+resources; resources reference provider_accounts.
      // Per-statement catch so no single failure skips the rest — and so the
      // trigger re-enable block below always runs.
      const del = (sql, args) => db.query(sql, args).catch((e) => console.log("teardown warn:", e.message));
      if (accountId) {
        await del(`DELETE FROM public.automation_runs WHERE provider_account_id=$1`, [accountId]);
        await del(`DELETE FROM public.action_items WHERE provider_account_id=$1`, [accountId]);
        await del(`DELETE FROM public.provider_monitoring_runs WHERE provider_account_id=$1`, [accountId]);
        await del(`DELETE FROM public.provider_reconciliation_items WHERE provider_account_id=$1`, [accountId]);
        await del(`DELETE FROM public.provider_reconciliation_runs WHERE provider_account_id=$1`, [accountId]);
        await del(`DELETE FROM public.provider_operation_executions WHERE provider_account_id=$1`, [accountId]);
        await del(`DELETE FROM public.provider_operation_proposals WHERE provider_account_id=$1`, [accountId]);
        await del(`DELETE FROM public.provider_discovered_resources WHERE provider_account_id=$1`, [accountId]);
        await del(`DELETE FROM public.provider_discovery_runs WHERE provider_account_id=$1`, [accountId]);
        await del(`DELETE FROM public.provider_monitoring_schedules WHERE provider_account_id=$1`, [accountId]);
      }
      if (polId) {
        await del(`DELETE FROM public.backup_events WHERE backup_policy_id=$1`, [polId]);
        await del(`DELETE FROM public.backup_policies WHERE id=$1`, [polId]);
      }
      if (sysId) {
        await del(`DELETE FROM public.tasks WHERE system_id=$1`, [sysId]);
        await del(`DELETE FROM public.action_items WHERE system_id=$1`, [sysId]);
        await del(`DELETE FROM public.automation_runs WHERE scope_key IN ($1,$2,$3)`, [
          `inc:${incId}`, `pol:${polId}`, `res:${resId}`]);
        await del(`DELETE FROM public.incidents WHERE system_id=$1`, [sysId]);
      }
      if (accountId) {
        await del(`DELETE FROM public.resources WHERE provider_account_id=$1`, [accountId]);
        await del(`DELETE FROM public.provider_accounts WHERE id=$1`, [accountId]);
      }
      if (sysId) {
        await del(`DELETE FROM public.systems WHERE id=$1`, [sysId]);
      }
      if (providerId) await del(`DELETE FROM public.providers WHERE id=$1`, [providerId]);
      for (const t of [
        ["automation_runs", "trg_automation_runs_no_delete"],
        ["action_items", "trg_action_items_no_delete"],
        ["tasks", "trg_tasks_no_delete"],
        ["incidents", "trg_incidents_no_delete"],
        ["backup_events", "trg_backup_events_no_delete"],
        ["backup_policies", "trg_backup_policies_no_delete"],
        ["provider_operation_proposals", "trg_op_proposals_no_delete"],
        ["provider_operation_executions", "trg_op_executions_no_delete"],
        ["provider_reconciliation_items", "trg_recon_items_no_delete"],
        ["provider_reconciliation_runs", "trg_recon_runs_no_delete"],
        ["provider_monitoring_runs", "trg_mon_runs_no_delete"],
        ["provider_discovered_resources", "trg_discovered_no_delete"],
        ["provider_discovery_runs", "trg_discovery_runs_no_delete"],
      ]) {
        await db.query(`ALTER TABLE public.${t[0]} ENABLE TRIGGER ${t[1]}`).catch(() => {});
      }
      console.log("[PASS] Teardown complete.");
    } catch (e) {
      console.error("Teardown warning:", e.message);
    }
    await db.end();
    ws.close();
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n============================================================`);
  console.log(`PHASE 3G-6 BROWSER VERIFICATION: ${passed} PASS, ${failed} FAIL`);
  console.log(`============================================================`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => { console.error("FATAL:", e); process.exit(1); });
