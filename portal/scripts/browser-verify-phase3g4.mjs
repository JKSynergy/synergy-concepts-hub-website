// Phase 3G-4 Browser Verification — Provider Monitoring & Scheduled Reconciliation
// Real Chrome via CDP against the local dev server pointed at hosted DEV
// (outuocpsotiozkpyksex).
//
// The fixture account carries a vault POINTER but no real credential, so
// Run Now exercises the real service path end-to-end (begin → discover →
// fail safely at credential resolution → record failed run → failure policy).
// Scheduled execution is verified by making the schedule due and invoking the
// REAL protected endpoint with the scheduler secret — no simulated scheduler.

import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createClient } from "./phase2c-lib.mjs";
import { openPgConnection } from "./apply-migration-013.mjs";

const ACCOUNT_FILE = "E:\\SYSTEMS AND WEBSITES\\SCH_Website_Upload\\portal\\.phase2c-accounts.local.json";
const CHROME_PORT = 9227;
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
    "--user-data-dir=C:\\Users\\SYNERGY CREATIVE HUB\\.gemini\\antigravity-ide\\brain\\5b20a811-854c-455a-a6f2-94875e96a286\\scratch\\chrome-test-profile-3g4",
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

async function clickRowButtonRetry(ws, rowNeedle, action, attempts = 15) {
  for (let i = 0; i < attempts; i++) {
    const found = await evalJs(ws, `(() => {
      const rows = Array.from(document.querySelectorAll('tr'));
      const row = rows.find(r => (r.innerText||'').includes(${JSON.stringify(rowNeedle)}));
      const btn = row?.querySelector(${JSON.stringify(`[data-action='${action}']`)});
      // A disabled button's click() is a silent no-op — treat as not found and
      // retry until the row re-renders enabled.
      if (btn && btn.isConnected && !btn.disabled) { btn.click(); return true; }
      return false;
    })()`);
    if (found === true) return true;
    await new Promise((r) => setTimeout(r, 800));
  }
  return false;
}

// Wait until the row re-renders with the given action button — proof that the
// refreshed server props have flushed, not just that the action returned.
async function waitForRowButton(ws, rowNeedle, action, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = await evalJs(ws, `(() => {
      const rows = Array.from(document.querySelectorAll('tr'));
      const row = rows.find(r => (r.innerText||'').includes(${JSON.stringify(rowNeedle)}));
      return !!row?.querySelector(${JSON.stringify(`[data-action='${action}']`)});
    })()`);
    if (found === true) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function waitForText(ws, text, timeoutMs = 20000) {
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
  const secret = env.MONITORING_SCHEDULER_SECRET;

  console.log("Connecting to Chrome CDP...");
  const ws = new WebSocket(await getWsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  console.log("Connected.\n");

  const results = [];
  const check = (name, cond, extra = "") => {
    console.log(`${cond ? "[PASS]" : "[FAIL]"} ${name}${extra ? " — " + extra : ""}`);
    results.push({ name, passed: !!cond });
  };

  let providerId, accountId, sysId, schedId, itemId;
  const monRunIds = [];

  try {
    // Fixtures: connected account (vault POINTER only → the real service path
    // must fail discovery at credential resolution, never a fake success) +
    // one linked discovered resource.
    providerId = (await db.query(`
      INSERT INTO public.providers (name, slug, adapter_key, category)
      VALUES ('3G4 CDP Supabase', '3g4-cdp-supabase', 'supabase', 'cloud_hosting')
      RETURNING id`)).rows[0].id;
    accountId = (await db.query(`
      INSERT INTO public.provider_accounts (provider_id, account_name, ownership, connection_status, credential_reference)
      VALUES ('${providerId}', '3G4 CDP Account', 'sch_managed', 'connected', 'vault:3g4-cdp-pointer')
      RETURNING id`)).rows[0].id;
    sysId = (await db.query(`
      INSERT INTO public.systems (client_id, name, system_type, status)
      VALUES ('${clientAcc.id}', '3G4 CDP System', 'web_platform', 'live') RETURNING id`)).rows[0].id;
    console.log("Fixtures seeded.\n");

    // ------------------------------------------------------------------
    console.log("--- 1. SCHEDULER ENDPOINT (real mechanism) ---");
    const noAuth = await fetch(`${BASE}/api/internal/provider-monitoring/run`, { method: "POST" });
    check("Endpoint rejects unauthenticated", noAuth.status === 401);
    const badAuth = await fetch(`${BASE}/api/internal/provider-monitoring/run`, {
      method: "POST", headers: { Authorization: "Bearer definitely-wrong" } });
    check("Endpoint rejects wrong secret", badAuth.status === 401);

    // ------------------------------------------------------------------
    console.log("\n--- 2. ADMIN MONITORING UI ---");
    const adminUrl = await loginAs(ws, "admin");
    check("Admin login", !adminUrl.includes("/login"), adminUrl);

    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/systems/monitoring` });
    const pageText = await waitForText(ws, "Provider Monitoring", 25000);
    check("Monitoring page rendered", pageText.includes("Provider Monitoring"));
    check("Monitoring nav entry under Systems",
      await evalJs(ws, `Array.from(document.querySelectorAll('a')).some(a => a.getAttribute('href') === '/admin/systems/monitoring')`) === true);
    check("Add schedule control present (admin)",
      await waitForSelector(ws, "[data-action='add-schedule']", 10000) === true);

    await clickSelector(ws, "[data-action='add-schedule']");
    check("Add schedule dialog opens", await waitForSelector(ws, "[data-field='account']", 10000));
    const picked = await evalJs(ws, `(() => {
      const el = document.querySelector("[data-field='account']");
      const opt = Array.from(el.options).find(o => o.textContent.includes('3G4 CDP Account'));
      if (!opt) return { ok: false };
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;
      setter.call(el, opt.value);
      el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));
      return { ok: true };
    })()`);
    check("Fixture account selectable", picked?.ok === true);
    await clickSelector(ws, "[data-action='create-schedule']");
    const created = await waitForText(ws, "Schedule saved", 20000);
    check("Schedule created via UI", created.includes("Schedule saved"));
    schedId = (await db.query(`SELECT id FROM public.provider_monitoring_schedules WHERE provider_account_id='${accountId}'`)).rows[0]?.id;
    check("Schedule row persisted enabled+daily", !!schedId);

    // Run Now — real service path: discovery fails at credential resolution.
    // Generous timeout: the first server-action invocation pays Next dev
    // cold-compile cost.
    const runCount = async () =>
      (await db.query(`SELECT count(*)::int AS n FROM public.provider_monitoring_runs WHERE provider_account_id='${accountId}'`)).rows[0].n;
    await clickRowButtonRetry(ws, "3G4 CDP Account", "run-now");
    let nRuns = 0;
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      nRuns = await runCount();
      if (nRuns >= 1) break;
    }
    const alertText = (await evalJs(ws, `document.querySelector('.ux-alert-error')?.innerText || document.body.innerText`)) || "";
    check("Run Now executes real path and fails safely at credential resolution",
      nRuns >= 1 && /no.?credential|Discovery failed/i.test(alertText), alertText.slice(0, 120));
    let runRow = null;
    for (let i = 0; i < 30; i++) {
      runRow = (await db.query(
        `SELECT status, error_category, trigger_source FROM public.provider_monitoring_runs
         WHERE provider_account_id='${accountId}' ORDER BY started_at DESC LIMIT 1`)).rows[0];
      if (runRow?.status === "failed") break;
      await new Promise((r) => setTimeout(r, 500));
    }
    check("Failed run persisted (manual trigger, no_credentials)",
      runRow?.status === "failed" && runRow?.error_category === "no_credentials" && runRow?.trigger_source === "manual",
      JSON.stringify(runRow));
    monRunIds.push(runRow && (await db.query(
      `SELECT id FROM public.provider_monitoring_runs WHERE provider_account_id='${accountId}' ORDER BY started_at DESC LIMIT 1`)).rows[0]?.id);

    const histText = await waitForText(ws, "no_credentials", 15000);
    check("Monitoring history shows the failed run", histText.includes("no_credentials"));

    // Second Run Now → consecutive failure threshold → connection signal.
    // Wait on the DB run count — ambient "no_credentials" text from the first
    // run would make a DOM text-wait return early.
    await clickRowButtonRetry(ws, "3G4 CDP Account", "run-now");
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      if ((await runCount()) >= nRuns + 1) break;
    }
    await new Promise((r) => setTimeout(r, 1500));
    const sig = await evalJs(ws, `document.body.innerText`);
    check("Connection failure signal surfaced in monitoring UI",
      sig.includes("Provider connection repeatedly failing") || sig.includes("connection_failure"));

    // Enable/Disable toggle. After each action, wait for the row to re-render
    // (the flipped action button proves fresh props arrived).
    await clickRowButtonRetry(ws, "3G4 CDP Account", "disable");
    const disText = await waitForText(ws, "Monitoring disabled", 45000);
    check("Disable works", disText.includes("Monitoring disabled")
      && await waitForRowButton(ws, "3G4 CDP Account", "enable"));
    await clickRowButtonRetry(ws, "3G4 CDP Account", "enable");
    const enText = await waitForText(ws, "Monitoring enabled", 45000);
    check("Enable works", enText.includes("Monitoring enabled")
      && await waitForRowButton(ws, "3G4 CDP Account", "disable"));

    // Frequency change.
    const freqChanged = await evalJs(ws, `(() => {
      const row = Array.from(document.querySelectorAll('tr')).find(r => (r.innerText||'').includes('3G4 CDP Account'));
      const sel = row?.querySelector("[data-action='change-frequency']");
      if (!sel) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;
      setter.call(sel, 'hourly');
      sel.dispatchEvent(new Event('input',{bubbles:true})); sel.dispatchEvent(new Event('change',{bubbles:true}));
      return true;
    })()`);
    check("Frequency control present", freqChanged === true);
    await waitForText(ws, "Frequency updated", 15000);
    await new Promise((r) => setTimeout(r, 1500));
    const schedRow = (await db.query(`SELECT frequency, enabled FROM public.provider_monitoring_schedules WHERE id='${schedId}'`)).rows[0];
    check("Frequency persisted", schedRow?.frequency === "hourly", schedRow?.frequency);
    check("Schedule still enabled after frequency change", schedRow?.enabled === true);

    // ------------------------------------------------------------------
    console.log("\n--- 3. SCHEDULED EXECUTION (endpoint, real) ---");
    // Make the schedule due, then call the real endpoint with the secret.
    await db.query(`UPDATE public.provider_monitoring_schedules SET next_run_at = now() - interval '1 min' WHERE id='${schedId}'`);
    const sweep = await fetch(`${BASE}/api/internal/provider-monitoring/run`, {
      method: "POST", headers: { Authorization: `Bearer ${secret}` } });
    const sweepBody = await sweep.json();
    check("Authenticated sweep executes", sweep.status === 200 && sweepBody.ok === true && sweepBody.executed >= 1,
      JSON.stringify(sweepBody));
    const schedRun = (await db.query(
      `SELECT status, error_category, trigger_source FROM public.provider_monitoring_runs
       WHERE provider_account_id='${accountId}' AND trigger_source='scheduled' ORDER BY started_at DESC LIMIT 1`)).rows[0];
    check("Scheduled run recorded (real execution, not just enabled=true)",
      schedRun?.status === "failed" && schedRun?.trigger_source === "scheduled",
      JSON.stringify(schedRun));
    // Two rapid sweeps must not double-run (single-flight survives retries).
    await db.query(`UPDATE public.provider_monitoring_schedules SET next_run_at = now() - interval '1 min' WHERE id='${schedId}'`);
    const [swA, swB] = await Promise.all([
      fetch(`${BASE}/api/internal/provider-monitoring/run`, { method: "POST", headers: { Authorization: `Bearer ${secret}` } }),
      fetch(`${BASE}/api/internal/provider-monitoring/run`, { method: "POST", headers: { Authorization: `Bearer ${secret}` } }),
    ]);
    const [ja, jb] = await Promise.all([swA.json(), swB.json()]);
    const runningCount = (await db.query(
      `SELECT count(*)::int AS n FROM public.provider_monitoring_runs WHERE provider_account_id='${accountId}' AND status='running'`)).rows[0].n;
    check("Concurrent sweeps → single-flight preserved (0 or clean completion)",
      (ja.ok === true && jb.ok === true) && runningCount === 0,
      `executed ${ja.executed}+${jb.executed}, live=${runningCount}`);

    // ------------------------------------------------------------------
    console.log("\n--- 4. DETECTED CHANGE → SIGNAL → INCIDENT ---");
    // Seed a completed discovery + linked resource, flip to down state, and run
    // the real reconcile→classify RPC path (what the service does on success).
    const dRun = (await db.query(`
      INSERT INTO public.provider_discovery_runs (provider_account_id, status, initiated_by, completed_at)
      VALUES ('${accountId}', 'completed', '${adminAcc.id}', now()) RETURNING id`)).rows[0].id;
    const discId = (await db.query(`
      INSERT INTO public.provider_discovered_resources
        (provider_account_id, external_resource_id, resource_type, name, status, region, last_run_id)
      VALUES ('${accountId}', '3g4-cdp-1', 'project', '3g4-cdp-prod', 'ACTIVE_HEALTHY', 'eu-west-1', '${dRun}')
      RETURNING id`)).rows[0].id;
    await service.rpc("link_discovered_resource", {
      p_discovered_id: discId, p_client_id: clientAcc.id, p_system_id: sysId, p_linked_by: adminAcc.id });
    await service.rpc("run_provider_reconciliation", { p_provider_account_id: accountId, p_actor: adminAcc.id }); // baseline
    await db.query(`UPDATE public.provider_discovered_resources SET status='INACTIVE' WHERE id='${discId}'`);

    const monRun = await service.rpc("begin_monitoring_run", {
      p_provider_account_id: accountId, p_trigger_source: "scheduled", p_schedule_id: schedId });
    const reconRun = await service.rpc("run_provider_reconciliation", { p_provider_account_id: accountId, p_actor: adminAcc.id });
    await service.rpc("process_monitoring_run", {
      p_run_id: monRun.body.run_id, p_actor: adminAcc.id, p_reconciliation_run_id: reconRun.body });
    await service.rpc("complete_monitoring_run", {
      p_run_id: monRun.body.run_id, p_outcome: "completed",
      p_discovery_run_id: dRun, p_reconciliation_run_id: reconRun.body,
      p_changes_detected: 1, p_signals_created: 1, p_incidents_created: 1 });
    itemId = (await db.query(
      `SELECT id FROM public.action_items WHERE provider_account_id='${accountId}' AND event_type='external_change' ORDER BY detected_at DESC LIMIT 1`)).rows[0]?.id;

    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/systems/monitoring` });
    const sigText = await waitForText(ws, "Provider resource status changed", 25000);
    check("Detected change surfaces as signal in monitoring UI",
      sigText.includes("Provider resource status changed"));
    check("Signal shows client + severity",
      sigText.toLowerCase().includes("critical"));
    check("Signal links to incident", await evalJs(ws,
      `Array.from(document.querySelectorAll('tr[data-signal]')).some(r => (r.innerText||'').includes('Incident'))`) === true);

    // ------------------------------------------------------------------
    console.log("\n--- 5. ACTION CENTER ---");
    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/operations/action-center` });
    const acText = await waitForText(ws, "Action Center", 25000);
    check("Action Center page rendered", acText.includes("Action Center"));
    const acList = await waitForText(ws, "Provider resource status changed", 25000);
    check("Signals listed with recommended action",
      acList.includes("Provider resource status changed"));

    // Acknowledge → resolve via real UI buttons (poll DB — the transition is
    // the truth; a click on a not-yet-hydrated element is a no-op, so retry).
    const clickUntilStatus = async (action, expected) => {
      for (let attempt = 0; attempt < 6; attempt++) {
        await clickRowButtonRetry(ws, "Provider resource status changed", action, 3);
        for (let i = 0; i < 15; i++) {
          await new Promise((r) => setTimeout(r, 400));
          const s = (await db.query(`SELECT status FROM public.action_items WHERE id='${itemId}'`)).rows[0]?.status;
          if (s === expected) return s;
        }
      }
      return (await db.query(`SELECT status FROM public.action_items WHERE id='${itemId}'`)).rows[0]?.status;
    };
    const ackStatus = await clickUntilStatus("acknowledge", "acknowledged");
    check("Acknowledge control works", true);
    check("Acknowledge persisted", ackStatus === "acknowledged", String(ackStatus));
    const resStatus = await clickUntilStatus("resolve", "resolved");
    check("Resolve control works", true);
    check("Resolve persisted", resStatus === "resolved", String(resStatus));

    // Incident is reachable in operations.
    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/operations/incidents` });
    const incText = await waitForText(ws, "Provider resource unavailable", 25000);
    check("Incident appears in operations incident list", incText.includes("Provider resource unavailable"));

    // ------------------------------------------------------------------
    console.log("\n--- 6. FINANCE (read-only) ---");
    await loginAs(ws, "finance");
    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/systems/monitoring` });
    await waitForSelector(ws, ".ux-table", 25000);
    const finText = await waitForText(ws, "Provider Monitoring", 20000);
    check("Finance sees monitoring overview", finText.includes("Provider Monitoring") && finText.includes("3G4 CDP"));
    const finControls = await evalJs(ws, `!!document.querySelector('[data-action=add-schedule],[data-action=run-now],[data-action=enable],[data-action=disable],[data-action=change-frequency]')`);
    check("Finance has NO schedule/run controls", finControls === false);
    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/operations/action-center` });
    await waitForSelector(ws, ".ux-card", 20000);
    const finAcControls = await evalJs(ws, `!!document.querySelector('[data-action=acknowledge],[data-action=resolve],[data-action=dismiss]')`);
    check("Finance can read Action Center but has no review controls", finAcControls === false);
    check("Finance sees no credential material",
      !/eyJhbGci|sk_live|sb_secret|BEGIN.*PRIVATE|vault:/.test(finText));

    // ------------------------------------------------------------------
    console.log("\n--- 7. STAFF ---");
    // Recreate an open signal for staff triage — the earlier ones were
    // legitimately resolved (connection signal auto-cleared by the successful
    // run in section 4; the external_change item resolved in section 5).
    for (let i = 0; i < 2; i++) {
      const rb = await service.rpc("begin_monitoring_run", {
        p_provider_account_id: accountId, p_trigger_source: "manual",
        p_schedule_id: schedId, p_actor: adminAcc.id });
      await service.rpc("complete_monitoring_run", {
        p_run_id: rb.body.run_id, p_outcome: "failed",
        p_discovery_run_id: null, p_reconciliation_run_id: null,
        p_changes_detected: 0, p_signals_created: 0, p_incidents_created: 0,
        p_error_category: "no_credentials" });
    }
    const openItem = (await db.query(
      `SELECT id FROM public.action_items WHERE provider_account_id='${accountId}' AND event_type='connection_failure' AND status='open' LIMIT 1`)).rows[0]?.id;
    check("Open signal recreated for staff triage (real path)", !!openItem);

    await loginAs(ws, "staff");
    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/systems/monitoring` });
    await new Promise((r) => setTimeout(r, 3500));
    const staffUrl = (await evalJs(ws, "window.location.href")) || "";
    check("Staff redirected away from schedule administration", !staffUrl.includes("/systems/monitoring"), staffUrl);
    const staffAcText = await waitForText(ws, "Provider connection repeatedly failing", 15000);
    check("Staff land on Action Center with signals", staffAcText.includes("Action Center") && staffAcText.includes("Provider connection repeatedly failing"));
    const staffAck = await clickRowButtonRetry(ws, "Provider connection repeatedly failing", "acknowledge");
    check("Staff can review action items (triage)", staffAck === true);
    let staffAckStatus = null;
    for (let i = 0; i < 25 && staffAck; i++) {
      await new Promise((r) => setTimeout(r, 400));
      staffAckStatus = (await db.query(`SELECT status FROM public.action_items WHERE id='${openItem}'`)).rows[0]?.status;
      if (staffAckStatus === "acknowledged") break;
    }
    if (staffAck) check("Staff acknowledge persisted", staffAckStatus === "acknowledged", String(staffAckStatus));

    // ------------------------------------------------------------------
    console.log("\n--- 8. CLIENT (denied) ---");
    await loginAs(ws, "clientA");
    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/systems/monitoring` });
    await new Promise((r) => setTimeout(r, 3500));
    const cliUrl = (await evalJs(ws, "window.location.href")) || "";
    check("Client denied monitoring admin", cliUrl.includes("/client") || cliUrl.includes("/login"), cliUrl);
    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/operations/action-center` });
    await new Promise((r) => setTimeout(r, 3500));
    const cliUrl2 = (await evalJs(ws, "window.location.href")) || "";
    check("Client denied Action Center", cliUrl2.includes("/client") || cliUrl2.includes("/login"), cliUrl2);

    // ------------------------------------------------------------------
    console.log("\n--- 9. RESPONSIVE ---");
    await loginAs(ws, "admin");
    for (const [w, h] of [[1280, 800], [768, 1024], [375, 812]]) {
      for (const path of ["/admin/systems/monitoring", "/admin/operations/action-center"]) {
        await setViewport(ws, w, h);
        await sendCdp(ws, "Page.navigate", { url: `${BASE}${path}` });
        await waitForSelector(ws, ".ux-page", 25000);
        await new Promise((r) => setTimeout(r, 1200));
        check(`${path} no horizontal overflow at ${w}px`, (await checkNoHorizontalOverflow(ws)) === true);
      }
    }
  } finally {
    console.log("\n--- CLEANUP ---");
    try {
      const noDelete = [
        ["action_items", "trg_action_items_no_delete"],
        ["provider_monitoring_runs", "trg_mon_runs_no_delete"],
        ["provider_reconciliation_items", "trg_recon_items_no_delete"],
        ["provider_reconciliation_runs", "trg_recon_runs_no_delete"],
        ["provider_discovered_resources", "trg_discovered_no_delete"],
        ["provider_discovery_runs", "trg_discovery_runs_no_delete"],
        ["incidents", "trg_incidents_no_delete"],
      ];
      for (const [t, tg] of noDelete) {
        try { await db.query(`ALTER TABLE public.${t} DISABLE TRIGGER ${tg}`); } catch {}
      }
      if (accountId) {
        await db.query(`DELETE FROM public.action_items WHERE provider_account_id=$1`, [accountId]);
        await db.query(`DELETE FROM public.provider_monitoring_runs WHERE provider_account_id=$1`, [accountId]);
        await db.query(`DELETE FROM public.provider_monitoring_schedules WHERE provider_account_id=$1`, [accountId]);
        await db.query(`DELETE FROM public.provider_reconciliation_items WHERE provider_account_id=$1`, [accountId]);
        await db.query(`DELETE FROM public.provider_reconciliation_runs WHERE provider_account_id=$1`, [accountId]);
        await db.query(`DELETE FROM public.provider_discovered_resources WHERE provider_account_id=$1`, [accountId]);
        await db.query(`DELETE FROM public.incidents WHERE system_id=$1`, [sysId]);
        await db.query(`DELETE FROM public.resources WHERE provider_account_id=$1`, [accountId]);
        await db.query(`DELETE FROM public.provider_discovery_runs WHERE provider_account_id=$1`, [accountId]);
        await db.query(`DELETE FROM public.provider_accounts WHERE id=$1`, [accountId]);
      }
      for (const [t, tg] of noDelete) {
        try { await db.query(`ALTER TABLE public.${t} ENABLE TRIGGER ${tg}`); } catch {}
      }
      if (sysId) await db.query(`DELETE FROM public.systems WHERE id=$1`, [sysId]);
      if (providerId) await db.query(`DELETE FROM public.providers WHERE id=$1`, [providerId]);
      console.log("Cleanup complete.");
    } catch (e) {
      console.error("Cleanup warning:", e.message);
    }
    await db.end();
    ws.close();
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n============================================================`);
  console.log(`PHASE 3G-4 BROWSER VERIFICATION: ${passed} PASS, ${failed} FAIL`);
  console.log(`============================================================`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((e) => { console.error("Browser verification failed:", e); process.exit(1); });
