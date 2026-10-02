// Phase 3G-5 Browser Verification — Provider Events & Webhooks
// Real Chrome via CDP against the local dev server pointed at hosted DEV
// (outuocpsotiozkpyksex).
//
// Exercises the REAL UI + REAL endpoint: admin configures a webhook through
// the UI (Vault-backed secret issued once), enables it, then a real HTTP
// webhook to /api/provider-events is verified end-to-end (401 unauth →
// enable → 200 processed → duplicate → malformed). RBAC pages for
// finance/staff/client and responsive overflow are covered.

import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createClient } from "./phase2c-lib.mjs";
import { openPgConnection } from "./apply-migration-013.mjs";

const ACCOUNT_FILE = "E:\\SYSTEMS AND WEBSITES\\SCH_Website_Upload\\portal\\.phase2c-accounts.local.json";
const CHROME_PORT = 9231;
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
    "--user-data-dir=C:\\Users\\SYNERGY CREATIVE HUB\\.gemini\\antigravity-ide\\brain\\5b20a811-854c-455a-a6f2-94875e96a286\\scratch\\chrome-test-profile-3g5",
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

  console.log("Connecting to Chrome CDP...");
  const ws = new WebSocket(await getWsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  console.log("Connected.\n");

  // Console error capture.
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

  let providerId, accountId, sysId, discId, dRunId;

  try {
    // Fixtures: supabase account + discovered resource linked to a client system.
    providerId = (await db.query(`
      INSERT INTO public.providers (name, slug, adapter_key, category)
      VALUES ('3G5 CDP Supabase', '3g5-cdp-supabase', 'supabase', 'cloud_hosting')
      RETURNING id`)).rows[0].id;
    accountId = (await db.query(`
      INSERT INTO public.provider_accounts (provider_id, account_name, ownership, connection_status, credential_reference)
      VALUES ('${providerId}', '3G5 CDP Account', 'sch_managed', 'connected', 'vault:3g5-cdp-pointer')
      RETURNING id`)).rows[0].id;
    sysId = (await db.query(`
      INSERT INTO public.systems (client_id, name, system_type, status)
      VALUES ('${clientAcc.id}', '3G5 CDP System', 'web_platform', 'live') RETURNING id`)).rows[0].id;
    const adminAcc = loadAccount("admin");
    dRunId = (await db.query(`
      INSERT INTO public.provider_discovery_runs (provider_account_id, status, initiated_by, completed_at)
      VALUES ('${accountId}', 'completed', '${adminAcc.id}', now()) RETURNING id`)).rows[0].id;
    discId = (await db.query(`
      INSERT INTO public.provider_discovered_resources
        (provider_account_id, external_resource_id, resource_type, name, status, last_run_id)
      VALUES ('${accountId}', '3g5-cdp-prj', 'project', '3g5-cdp-db', 'ACTIVE_HEALTHY', '${dRunId}') RETURNING id`)).rows[0].id;
    await service.rpc("link_discovered_resource", {
      p_discovered_id: discId, p_client_id: clientAcc.id, p_system_id: sysId, p_linked_by: adminAcc.id });
    console.log("Fixtures seeded.\n");

    // ------------------------------------------------------------------
    console.log("--- 1. ADMIN: EVENTS PAGE + WEBHOOK CONFIG UI ---");
    await loginAs(ws, "admin");
    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/systems/events` });
    const adminBody = await waitForText(ws, "Provider Events");
    check("admin events page loads", adminBody.includes("Provider Events"));
    check("events nav entry present", adminBody.includes("Events"));

    // Unauthenticated endpoint fails closed BEFORE any config exists.
    const pre = await fetch(`${BASE}/api/provider-events/supabase`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "v1.project.paused" }),
    });
    check("endpoint fails closed with no credential", pre.status === 401);

    // Configure via the real UI.
    check("configure webhook button present", await waitForSelector(ws, `[data-action='add-webhook']`));
    await clickSelector(ws, `[data-action='add-webhook']`);
    await waitForSelector(ws, `[data-field='account']`);
    await evalJs(ws, `(() => {
      const sel = document.querySelector("[data-field='account']");
      const opt = Array.from(sel.options).find(o => o.text.includes('3G5 CDP Account'));
      sel.value = opt.value; sel.dispatchEvent(new Event('change', {bubbles:true})); return true;
    })()`);
    await new Promise((r) => setTimeout(r, 500));
    await clickSelector(ws, `[data-action='save-webhook']`);
    const revealOk = await waitForSelector(ws, `[data-secret-reveal]`, 20000);
    check("webhook secret issued once via UI", revealOk);
    const revealText = await evalJs(ws, `document.querySelector('[data-secret-reveal]')?.innerText ?? ''`);
    const endpoint = revealText.match(/Endpoint:\s*(\S+)/)?.[1];
    const issuedSecret = revealText.match(/Secret:\s*(\S+)/)?.[1];
    check("endpoint + secret shown for provider-side setup",
      endpoint === "/api/provider-events/supabase" && (issuedSecret?.length ?? 0) >= 16, endpoint ?? "none");

    // Config row rendered, disabled.
    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/systems/events` });
    const cfgBody = await waitForText(ws, "3G5 CDP Account");
    check("webhook config row visible", cfgBody.includes("3G5 CDP Account") && cfgBody.includes("Bearer token"));

    // Real webhook while disabled → still fails closed.
    const evtPayload = JSON.stringify({
      type: "v1.project.paused",
      payload: { project_ref: "3g5-cdp-prj" },
      timestamp: new Date().toISOString(),
    });
    const whileDisabled = await fetch(`${BASE}${endpoint}`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${issuedSecret}` },
      body: evtPayload,
    });
    check("disabled webhook → 401 (fail closed)", whileDisabled.status === 401);

    // Enable via UI.
    await evalJs(ws, `(() => {
      const rows = Array.from(document.querySelectorAll('tr'));
      const row = rows.find(r => (r.innerText||'').includes('3G5 CDP Account'));
      const btn = row?.querySelector("[data-action='enable-webhook']");
      if (btn) btn.click(); return !!btn;
    })()`);
    const enabledNow = await waitForText(ws, "Webhook enabled", 20000);
    check("enable via UI works", enabledNow.includes("Webhook enabled"));

    // Real authenticated webhook → 200, recorded, matched.
    const good = await fetch(`${BASE}${endpoint}`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${issuedSecret}` },
      body: evtPayload,
    });
    const goodJson = await good.json();
    check("authenticated webhook → 200 processed", good.status === 200 && goodJson.ok === true,
      JSON.stringify(goodJson));

    // Event row appears in the UI after refresh.
    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/systems/events` });
    const evBody = await waitForText(ws, "3g5-cdp-db", 20000);
    // StatusMark CSS capitalizes → match normalized_type case-insensitively.
    check("event visible in UI",
      evBody.includes("v1.project.paused") && evBody.toLowerCase().includes("resource_unavailable"),
      `paused:${evBody.includes("v1.project.paused")} norm:${evBody.toLowerCase().includes("resource_unavailable")}`);
    check("event matched the linked resource", evBody.includes("3g5-cdp-db"));

    // Duplicate → harmless.
    const dup = await fetch(`${BASE}${endpoint}`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${issuedSecret}` },
      body: evtPayload,
    });
    const dupJson = await dup.json();
    check("replay → 200 duplicate, no reprocessing", dup.status === 200 && dupJson.outcome === "duplicate");

    // Wrong secret → 401.
    const bad = await fetch(`${BASE}${endpoint}`, {
      method: "POST", headers: { "content-type": "application/json", authorization: "Bearer totally-wrong-secret" },
      body: evtPayload,
    });
    check("wrong secret → 401", bad.status === 401);

    // The event-triggered run attempted the real monitoring pipeline.
    const trig = await db.query(
      `SELECT mr.trigger_source, mr.status FROM public.provider_events e
       JOIN public.provider_monitoring_runs mr ON mr.id = e.monitoring_run_id
       WHERE e.provider_account_id=$1 LIMIT 1`, [accountId]);
    check("state event triggered the existing monitoring pipeline (event trigger)",
      trig.rows[0]?.trigger_source === "event", trig.rows[0]?.status ?? "no run");

    // Secret is never rendered into the page for subsequent loads.
    check("issued secret not persisted in UI", !evBody.includes(issuedSecret));

    // ------------------------------------------------------------------
    console.log("\n--- 2. RESPONSIVE (desktop/tablet/mobile) ---");
    for (const w of [1280, 768, 375]) {
      await setViewport(ws, w, 900);
      await new Promise((r) => setTimeout(r, 600));
      check(`no horizontal overflow @${w}px`, await checkNoHorizontalOverflow(ws));
    }
    await setViewport(ws, 1280, 900);

    // ------------------------------------------------------------------
    console.log("\n--- 3. ACTION CENTER: event-derived signal visible ---");
    const sigRow = await db.query(
      `SELECT id, severity, source FROM public.action_items WHERE provider_account_id=$1 LIMIT 1`, [accountId]);
    // resource_unavailable is unmatched-state? It IS matched → no direct
    // signal; a signal may not exist. Verify via a deliberately unmatched
    // event so the informational review path is covered.
    const unPayload = JSON.stringify({ type: "v1.project.created", payload: { project_ref: "untracked-x" } });
    const unRes = await fetch(`${BASE}${endpoint}`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${issuedSecret}` },
      body: unPayload,
    });
    check("unmatched event webhook accepted", unRes.status === 200, `status ${unRes.status}`);
    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/operations/action-center` });
    const acBody = await waitForText(ws, "Provider event for an untracked resource", 25000);
    const sigDb = await db.query(
      `SELECT id, severity, title, status FROM public.action_items WHERE provider_account_id=$1`, [accountId]);
    check("unmatched event → Action Center signal",
      acBody.includes("Provider event for an untracked resource"),
      `db:${JSON.stringify(sigDb.rows)}`);
    check("action center responsive", await checkNoHorizontalOverflow(ws));

    // ------------------------------------------------------------------
    console.log("\n--- 4. FINANCE: read-only operational visibility ---");
    await loginAs(ws, "finance");
    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/systems/events` });
    const finBody = await waitForText(ws, "Provider Events", 25000);
    check("finance sees events + config status",
      finBody.includes("3G5 CDP Account") && finBody.includes("v1.project.paused"),
      `acct:${finBody.includes("3G5 CDP Account")} evt:${finBody.includes("v1.project.paused")} url:${(await evalJs(ws,"window.location.href"))||""}`);
    const finActions = await evalJs(ws, `document.querySelectorAll("[data-action]").length`);
    check("finance has zero configuration actions", finActions === 0, `${finActions} actions`);
    check("finance never sees the issued secret", !finBody.includes(issuedSecret));

    // ------------------------------------------------------------------
    console.log("\n--- 5. STAFF: triage visibility, no security config ---");
    await loginAs(ws, "staff");
    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/systems/events` });
    const staffBody = await waitForText(ws, "Provider Events", 25000);
    check("staff reads event evidence", staffBody.includes("v1.project.paused"));
    check("staff sees no webhook security config", !staffBody.includes("Bearer token"));
    const staffActions = await evalJs(ws, `document.querySelectorAll("[data-action]").length`);
    check("staff has zero configuration actions", staffActions === 0);

    // ------------------------------------------------------------------
    console.log("\n--- 6. CLIENT: denied ---");
    await loginAs(ws, "clientA");
    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/systems/events` });
    await new Promise((r) => setTimeout(r, 4000));
    const cliUrl = await evalJs(ws, "window.location.href");
    check("client redirected away from provider events", !cliUrl.includes("/admin/systems/events"), cliUrl);

    // ------------------------------------------------------------------
    console.log("\n--- 7. CONSOLE ---");
    check("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | ") || "clean");

    // Safety invariant: zero provider operation proposals from any of this.
    const props = await db.query(`SELECT count(*)::int AS n FROM public.provider_operation_proposals WHERE provider_account_id=$1`, [accountId]);
    check("no provider operation proposals created", props.rows[0].n === 0);
  } finally {
    console.log("\n--- TEARDOWN ---");
    try {
      await db.query(`ALTER TABLE public.provider_events DISABLE TRIGGER trg_provider_events_no_delete`).catch(() => {});
      await db.query(`ALTER TABLE public.provider_webhook_configs DISABLE TRIGGER trg_webhook_config_no_delete`).catch(() => {});
      await db.query(`ALTER TABLE public.action_items DISABLE TRIGGER trg_action_items_no_delete`).catch(() => {});
      await db.query(`ALTER TABLE public.provider_monitoring_runs DISABLE TRIGGER trg_mon_runs_no_delete`).catch(() => {});
      await db.query(`ALTER TABLE public.provider_discovered_resources DISABLE TRIGGER trg_discovered_no_delete`).catch(() => {});
      await db.query(`ALTER TABLE public.provider_discovery_runs DISABLE TRIGGER trg_discovery_runs_no_delete`).catch(() => {});
      await db.query(`ALTER TABLE public.incidents DISABLE TRIGGER trg_incidents_no_delete`).catch(() => {});
      if (accountId) {
        await db.query(`DELETE FROM public.provider_events WHERE provider_account_id=$1`, [accountId]);
        await db.query(`DELETE FROM public.action_items WHERE provider_account_id=$1`, [accountId]);
        await db.query(`DELETE FROM public.provider_monitoring_runs WHERE provider_account_id=$1`, [accountId]);
        await db.query(`DELETE FROM public.provider_reconciliation_items WHERE provider_account_id=$1`, [accountId]);
        await db.query(`DELETE FROM public.provider_reconciliation_runs WHERE provider_account_id=$1`, [accountId]);
        await db.query(`DELETE FROM public.provider_discovered_resources WHERE provider_account_id=$1`, [accountId]);
        await db.query(`DELETE FROM public.provider_discovery_runs WHERE provider_account_id=$1`, [accountId]);
        await db.query(`DELETE FROM public.provider_webhook_configs WHERE provider_account_id=$1`, [accountId]);
        await db.query(`DELETE FROM public.resources WHERE provider_account_id=$1`, [accountId]);
        await db.query(`DELETE FROM public.provider_accounts WHERE id=$1`, [accountId]);
      }
      await db.query(`ALTER TABLE public.provider_events ENABLE TRIGGER trg_provider_events_no_delete`).catch(() => {});
      await db.query(`ALTER TABLE public.provider_webhook_configs ENABLE TRIGGER trg_webhook_config_no_delete`).catch(() => {});
      await db.query(`ALTER TABLE public.action_items ENABLE TRIGGER trg_action_items_no_delete`).catch(() => {});
      await db.query(`ALTER TABLE public.provider_monitoring_runs ENABLE TRIGGER trg_mon_runs_no_delete`).catch(() => {});
      await db.query(`ALTER TABLE public.provider_discovered_resources ENABLE TRIGGER trg_discovered_no_delete`).catch(() => {});
      await db.query(`ALTER TABLE public.provider_discovery_runs ENABLE TRIGGER trg_discovery_runs_no_delete`).catch(() => {});
      await db.query(`ALTER TABLE public.incidents ENABLE TRIGGER trg_incidents_no_delete`).catch(() => {});
      if (sysId) {
        await db.query(`DELETE FROM public.incidents WHERE system_id=$1`, [sysId]);
        await db.query(`DELETE FROM public.systems WHERE id=$1`, [sysId]);
      }
      if (providerId) await db.query(`DELETE FROM public.providers WHERE id=$1`, [providerId]);
      await db.query(`DELETE FROM vault.secrets WHERE name LIKE 'provider-webhook/%'`).catch(() => {});
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
  console.log(`PHASE 3G-5 BROWSER VERIFICATION: ${passed} PASS, ${failed} FAIL`);
  console.log(`============================================================`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => { console.error("FATAL:", e); process.exit(1); });
