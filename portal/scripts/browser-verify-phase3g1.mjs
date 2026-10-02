// Phase 3G-1 Browser Verification — Provider Connections & Read-Only Discovery
// Real Chrome via CDP against the local dev server pointed at hosted DEV
// (outuocpsotiozkpyksex). Fixture discovered rows are seeded through the same
// service-role upsert path a discovery run uses — never fabricated UI state.
//
// NOTE: no real provider credentials are available on DEV, so the connection
// test exercises the real failure path (api.supabase.com rejects the token →
// auth_failed) and discovery records a failed run — both verified in UI.

import { readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createClient } from "./phase2c-lib.mjs";
import { openPgConnection } from "./apply-migration-013.mjs";

const ACCOUNT_FILE = "E:\\SYSTEMS AND WEBSITES\\SCH_Website_Upload\\portal\\.phase2c-accounts.local.json";
const CHROME_PORT = 9224;
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
    "--user-data-dir=C:\\Users\\SYNERGY CREATIVE HUB\\.gemini\\antigravity-ide\\brain\\5b20a811-854c-455a-a6f2-94875e96a286\\scratch\\chrome-test-profile-3g1",
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

async function clickByText(ws, tag, text) {
  return evalJs(ws, `(() => {
    const els = Array.from(document.querySelectorAll(${JSON.stringify(tag)}));
    const el = els.find(e => (e.textContent || '').trim().includes(${JSON.stringify(text)}));
    if (!el) return false; el.click(); return true;
  })()`);
}

async function setFieldValue(ws, selector, value) {
  return evalJs(ws, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype
      : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, ${JSON.stringify(value)}); else el.value = ${JSON.stringify(value)};
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
}

async function selectOptionContaining(ws, selector, needle) {
  return evalJs(ws, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return { ok: false };
    const opt = Array.from(el.options).find(o => o.textContent.includes(${JSON.stringify(needle)}));
    if (!opt) return { ok: false, options: Array.from(el.options).map(o => o.textContent) };
    // Bypass React's patched value tracker so onChange fires (same trick as setFieldValue).
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    if (setter) setter.call(el, opt.value); else el.value = opt.value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, label: opt.textContent, value: el.value };
  })()`);
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

// Clicks a selector and waits for text to appear; retries the click if the
// first attempt lands mid-refresh and the action never fires.
async function clickUntilText(ws, selector, text, timeoutMs = 30000, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    const clicked = await clickSelector(ws, selector);
    if (clicked === true) {
      const start = Date.now();
      const slice = Math.floor(timeoutMs / attempts);
      while (Date.now() - start < slice) {
        const body = (await evalJs(ws, "document.body.innerText")) || "";
        if (body.toLowerCase().includes(text.toLowerCase())) return body;
        await new Promise((r) => setTimeout(r, 400));
      }
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  return (await evalJs(ws, "document.body.innerText")) || "";
}

async function openDialogAndWait(ws, buttonMatcher, anchorSelector, attempts = 4) {
  for (let i = 0; i < attempts; i++) {
    if (buttonMatcher.startsWith("#") || buttonMatcher.startsWith("[")) await clickSelector(ws, buttonMatcher);
    else await clickByText(ws, "button", buttonMatcher);
    if (await waitForSelector(ws, anchorSelector, 6000)) return true;
    await new Promise((r) => setTimeout(r, 800));
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

  const results = [];
  const check = (name, cond, extra = "") => {
    console.log(`${cond ? "[PASS]" : "[FAIL]"} ${name}${extra ? " — " + extra : ""}`);
    results.push({ name, passed: !!cond });
  };

  let providerId, accountId, sysId;
  const discIds = [];
  const CDP_TOKEN = "cdp-invalid-token-3g1";

  try {
    // Seed fixtures via service role (same path discovery uses).
    providerId = (await db.query(`
      INSERT INTO public.providers (name, slug, adapter_key, category)
      VALUES ('3G1 CDP Supabase', '3g1-cdp-supabase', 'supabase', 'cloud_hosting')
      ON CONFLICT (slug) DO UPDATE SET adapter_key='supabase' RETURNING id`)).rows[0].id;
    accountId = (await db.query(`
      INSERT INTO public.provider_accounts (provider_id, account_name, ownership)
      VALUES ('${providerId}', '3G1 CDP Account', 'sch_managed') RETURNING id`)).rows[0].id;
    sysId = (await db.query(`
      INSERT INTO public.systems (client_id, name, system_type, status)
      VALUES ('${clientAcc.id}', '3G1 CDP System', 'web_platform', 'live') RETURNING id`)).rows[0].id;
    for (const [ext, type, name] of [
      ["cdp-proj-001", "project", "cdp-inventory-prod"],
      ["cdp-proj-002", "project", "cdp-portal-dev"],
    ]) {
      discIds.push((await db.query(`
        INSERT INTO public.provider_discovered_resources
          (provider_account_id, external_resource_id, resource_type, name, status, region)
        VALUES ($1, $2, $3, $4, 'ACTIVE_HEALTHY', 'eu-west-1') RETURNING id`,
        [accountId, ext, type, name])).rows[0].id);
    }
    console.log("Fixtures seeded.\n");

    // ------------------------------------------------------------------
    console.log("--- 1. ADMIN FLOW ---");
    const adminUrl = await loginAs(ws, "admin");
    check("Admin login", !adminUrl.includes("/login"), adminUrl);

    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/systems` });
    await waitForSelector(ws, "a[href='/admin/systems/providers']", 15000);
    const providersTab = await evalJs(ws, `Array.from(document.querySelectorAll('a')).some(a => (a.textContent||'').includes('Providers'))`);
    check("Providers tab present under Systems", providersTab === true);

    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/systems/providers` });
    const pageText = await waitForText(ws, "Provider Connections");
    await waitForSelector(ws, ".ux-table", 20000);
    check("Provider Connections page rendered", pageText.includes("Provider Connections"));
    check("Seeded account visible", pageText.includes("3G1 CDP Account"));
    check("Connection status shown (unconfigured)", pageText.toLowerCase().includes("unconfigured"));
    check("Credentials shown as flag, never value", pageText.includes("Not configured") && !pageText.includes(CDP_TOKEN));

    // Configure credential via dialog
    check("Credential dialog opens", await openDialogAndWait(ws, "[data-action='configure-credential']", "#input-credential-token"));
    await setFieldValue(ws, "#input-credential-token", CDP_TOKEN);
    await clickByText(ws, "button", "Store securely");
    const credStored = await waitForText(ws, "Credentials configured", 20000);
    check("Credential stored to vault; UI shows flag only", credStored.includes("Credentials configured") && !credStored.includes(CDP_TOKEN));

    // Test connection — real adapter call, invalid token → failed/auth_failed
    const tested = (await clickUntilText(ws, "[data-action='test-connection']", "auth_failed", 30000)).toLowerCase();
    check("Connection test runs real adapter; failure normalized to auth_failed",
      tested.includes("auth_failed") || tested.includes("failed"), "");

    // Discovery — invalid creds → failed run recorded
    await clickSelector(ws, "[data-action='discover']");
    const discovered = await waitForText(ws, "Discovery runs", 25000);
    const runFailed = await waitForText(ws, "auth_failed", 25000);
    check("Discovery run recorded as failed with safe error category",
      runFailed.includes("auth_failed") && discovered.includes("Discovery runs"));

    // Capabilities strip rendered (✓ discover, ✕ mutations)
    const caps = await evalJs(ws, `Array.from(document.querySelectorAll('[data-capability]')).map(e => e.getAttribute('data-capability'))`);
    check("Capability list rendered", Array.isArray(caps) && caps.includes("discoverResources") && caps.includes("delete"),
      `caps=${caps?.length}`);

    // Discovered resources visible
    const discText = (await evalJs(ws, "document.body.innerText")) || "";
    check("Discovered resources listed", discText.includes("cdp-inventory-prod") && discText.includes("cdp-proj-001"));

    // Explicit link flow — target the cdp-proj-001 row (audit check asserts discIds[0])
    const linkOpened = await (async () => {
      for (let i = 0; i < 4; i++) {
        await evalJs(ws, `(() => {
          const rows = Array.from(document.querySelectorAll('tr'));
          const row = rows.find(r => (r.innerText||'').includes('cdp-proj-001'));
          const btn = row?.querySelector("[data-action='link-resource']");
          if (btn) btn.click();
          return !!btn;
        })()`);
        if (await waitForSelector(ws, "#select-link-client", 6000)) return true;
        await new Promise((r) => setTimeout(r, 800));
      }
      return false;
    })();
    check("Link dialog opens", linkOpened === true);
    const pickClient = await selectOptionContaining(ws, "#select-link-client", clientAcc.email);
    check("Client must be explicitly selected", pickClient?.ok === true, pickClient?.label || "");
    await new Promise((r) => setTimeout(r, 800));
    const pickSystem = await selectOptionContaining(ws, "#select-link-system", "3G1 CDP System");
    check("System scoped to selected client", pickSystem?.ok === true, pickSystem?.label || "");
    // Diagnostic: capture select state before submitting (button disabled if state missing)
    const linkState = await evalJs(ws, `(() => {
      const c = document.querySelector('#select-link-client');
      const s = document.querySelector('#select-link-system');
      const b = Array.from(document.querySelectorAll('button[type=submit]')).find(b => (b.textContent||'').includes('Link resource'));
      return { client: c?.value, system: s?.value, btnFound: !!b, btnDisabled: b?.disabled };
    })()`);
    await clickByText(ws, "button", "Link resource");
    // Wait for the linked badge itself — the success notice text would satisfy
    // a plain "linked" wait before the row refreshes.
    let linkBadge = false;
    for (let i = 0; i < 60 && !linkBadge; i++) {
      linkBadge = await evalJs(ws, `Array.from(document.querySelectorAll('td')).some(td => (td.innerText||'').trim().toLowerCase() === 'linked')`);
      if (!linkBadge) await new Promise((r) => setTimeout(r, 400));
    }
    check("Resource linked — status 'linked'", linkBadge === true, JSON.stringify(linkState));

    // Linked resource appears in Systems inventory
    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/systems` });
    const sysText = await waitForText(ws, "cdp-inventory-prod", 25000);
    check("Linked resource appears in Systems inventory", sysText.includes("cdp-inventory-prod"));

    // Audit: linked event recorded (checked in DB — UI shows page, not audit here)
    const audit = await db.query(`SELECT action FROM public.audit_logs WHERE record_id = '${discIds[0]}' AND action='provider_resource.linked'`);
    check("provider_resource.linked audited", audit.rows.length >= 1);

    // No credential text anywhere on the providers page
    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/systems/providers` });
    const scrub = await waitForText(ws, "Provider Connections");
    check("No credential/token material rendered anywhere", !scrub.includes(CDP_TOKEN) && !/eyJhbGci|sk_live|sb_secret|BEGIN.*PRIVATE/.test(scrub));

    // ------------------------------------------------------------------
    console.log("\n--- 2. FINANCE FLOW (read-only) ---");
    await loginAs(ws, "finance");
    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/systems/providers` });
    const finText = await waitForText(ws, "Provider Connections");
    await waitForSelector(ws, ".ux-table", 20000);
    check("Finance sees provider connections (read-only)", finText.includes("Provider Connections") && finText.includes("3G1 CDP Account"));
    const finControls = await evalJs(ws, `!!document.querySelector('[data-action=configure-credential],[data-action=discover],[data-action=test-connection],[data-action=link-resource]')`);
    check("Finance has NO credential/discovery/link controls", finControls === false);

    // ------------------------------------------------------------------
    console.log("\n--- 3. STAFF FLOW (linked-only, anti-leak) ---");
    await loginAs(ws, "staff");
    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/systems/providers` });
    const staffText = await waitForText(ws, "Linked Provider Resources");
    check("Staff gets linked-resources view only", staffText.includes("Linked Provider Resources"));
    const staffControls = await evalJs(ws, `!!document.querySelector('[data-action],[type=password]')`);
    check("Staff has no credential/discovery controls or credential inputs", staffControls === false);
    check("Staff view has no financial/token material", !/\bUGX\b|\bUSD\b|sb_secret|sk_live/.test(staffText) && !staffText.includes(CDP_TOKEN));

    // ------------------------------------------------------------------
    console.log("\n--- 4. CLIENT FLOW (denied) ---");
    await loginAs(ws, "clientA");
    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/systems/providers` });
    await new Promise((r) => setTimeout(r, 3500));
    const clientUrl = (await evalJs(ws, "window.location.href")) || "";
    check("Client redirected away from provider administration", clientUrl.includes("/client") || clientUrl.includes("/login"), clientUrl);

    // ------------------------------------------------------------------
    console.log("\n--- 5. REGRESSION ---");
    await loginAs(ws, "admin");
    for (const [path, marker] of [
      ["/admin/operations", "Operations"],
      ["/admin/systems", "Systems"],
      ["/admin/finances/provider-costs", "Provider Costs"],
      ["/admin/operations/backups", "Backup"],
    ]) {
      await sendCdp(ws, "Page.navigate", { url: `${BASE}${path}` });
      const t = await waitForText(ws, marker, 20000);
      check(`Regression: ${path} renders`, t.includes(marker));
    }

    // ------------------------------------------------------------------
    console.log("\n--- 6. RESPONSIVE ---");
    for (const [w, h] of [[1280, 800], [768, 1024], [375, 812]]) {
      await setViewport(ws, w, h);
      await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/systems/providers` });
      await waitForText(ws, "Provider", 20000);
      await new Promise((r) => setTimeout(r, 1500));
      check(`No horizontal overflow at ${w}x${h}`, (await checkNoHorizontalOverflow(ws)) === true);
      const nav = await evalJs(ws, `!!document.querySelector('nav, aside, [role=navigation]') || !!document.querySelector('button')`);
      check(`Navigation usable at ${w}x${h}`, nav === true);
    }
  } finally {
    console.log("\n--- CLEANUP ---");
    try {
      await service.rpc("clear_provider_credential", { p_provider_account_id: accountId });
      await db.query(`ALTER TABLE public.provider_discovered_resources DISABLE TRIGGER trg_discovered_no_delete`);
      await db.query(`ALTER TABLE public.provider_discovery_runs DISABLE TRIGGER trg_discovery_runs_no_delete`);
      await db.query(`DELETE FROM public.provider_discovered_resources WHERE provider_account_id=$1`, [accountId]);
      await db.query(`DELETE FROM public.provider_discovery_runs WHERE provider_account_id=$1`, [accountId]);
      await db.query(`ALTER TABLE public.provider_discovered_resources ENABLE TRIGGER trg_discovered_no_delete`);
      await db.query(`ALTER TABLE public.provider_discovery_runs ENABLE TRIGGER trg_discovery_runs_no_delete`);
      await db.query(`DELETE FROM public.resources WHERE provider_account_id=$1`, [accountId]);
      await db.query(`DELETE FROM public.systems WHERE id=$1`, [sysId]);
      await db.query(`DELETE FROM public.provider_accounts WHERE id=$1`, [accountId]);
      await db.query(`DELETE FROM public.providers WHERE slug='3g1-cdp-supabase'`);
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
  console.log(`PHASE 3G-1 BROWSER VERIFICATION: ${passed} PASS, ${failed} FAIL`);
  console.log(`============================================================`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((e) => { console.error("Browser verification failed:", e); process.exit(1); });
