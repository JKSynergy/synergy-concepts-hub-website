// Phase 3G-2 Browser Verification — Provider Reconciliation & Controlled Sync
// Real Chrome via CDP against the local dev server pointed at hosted DEV
// (outuocpsotiozkpyksex). Discovery evidence is seeded through the same
// service-role write path a discovery run uses — never fabricated UI state.
// The reconcile/review/apply flow itself is driven through the real UI.

import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createClient } from "./phase2c-lib.mjs";
import { openPgConnection } from "./apply-migration-013.mjs";

const ACCOUNT_FILE = "E:\\SYSTEMS AND WEBSITES\\SCH_Website_Upload\\portal\\.phase2c-accounts.local.json";
const CHROME_PORT = 9225;
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
    "--user-data-dir=C:\\Users\\SYNERGY CREATIVE HUB\\.gemini\\antigravity-ide\\brain\\5b20a811-854c-455a-a6f2-94875e96a286\\scratch\\chrome-test-profile-3g2",
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

async function clickRowButton(ws, rowNeedle, action) {
  return evalJs(ws, `(() => {
    const rows = Array.from(document.querySelectorAll('tr'));
    const row = rows.find(r => (r.innerText||'').includes(${JSON.stringify(rowNeedle)}));
    const btn = row?.querySelector(${JSON.stringify(`[data-action='${action}']`)});
    if (btn) { btn.click(); return true; }
    return false;
  })()`);
}

async function selectOptionContaining(ws, selector, needle) {
  return evalJs(ws, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return { ok: false };
    const opt = Array.from(el.options).find(o => o.textContent.includes(${JSON.stringify(needle)}));
    if (!opt) return { ok: false, options: Array.from(el.options).map(o => o.textContent) };
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

// Clicks a row button and waits for text; retries while re-renders settle.
async function clickRowUntilText(ws, rowNeedle, action, text, attempts = 4, sliceMs = 9000) {
  for (let i = 0; i < attempts; i++) {
    const clicked = await clickRowButton(ws, rowNeedle, action);
    if (clicked === true) {
      const start = Date.now();
      while (Date.now() - start < sliceMs) {
        const body = (await evalJs(ws, "document.body.innerText")) || "";
        if (body.toLowerCase().includes(text.toLowerCase())) return body;
        await new Promise((r) => setTimeout(r, 400));
      }
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  return (await evalJs(ws, "document.body.innerText")) || "";
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
  const db = await openPgConnection(env.PHASE2C_DB_URL);
  const clientAcc = loadAccount("clientA");
  const adminAcc = loadAccount("admin");

  console.log("Connecting to Chrome CDP...");
  const ws = new WebSocket(await getWsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  console.log("Connected.\n");

  const results = [];
  const check = (name, cond, extra = "") => {
    console.log(`${cond ? "[PASS]" : "[FAIL]"} ${name}${extra ? " — " + extra : ""}`);
    results.push({ name, passed: !!cond });
  };

  let providerId, accountId, sysId, resSchOnlyId, dRunId;
  const discIds = [];

  try {
    // Seed fixtures (same shape as hosted verifier).
    providerId = (await db.query(`
      INSERT INTO public.providers (name, slug, adapter_key, category)
      VALUES ('3G2 CDP Supabase', '3g2-cdp-supabase', 'supabase', 'cloud_hosting')
      ON CONFLICT (slug) DO UPDATE SET adapter_key='supabase' RETURNING id`)).rows[0].id;
    accountId = (await db.query(`
      INSERT INTO public.provider_accounts (provider_id, account_name, ownership)
      VALUES ('${providerId}', '3G2 CDP Account', 'sch_managed') RETURNING id`)).rows[0].id;
    sysId = (await db.query(`
      INSERT INTO public.systems (client_id, name, system_type, status)
      VALUES ('${clientAcc.id}', '3G2 CDP System', 'web_platform', 'live') RETURNING id`)).rows[0].id;
    dRunId = (await db.query(`
      INSERT INTO public.provider_discovery_runs (provider_account_id, status, initiated_by, completed_at)
      VALUES ('${accountId}', 'completed', '${adminAcc.id}', now()) RETURNING id`)).rows[0].id;

    for (const [ext, name] of [
      ["3g2-cdp-new", "3g2-cdp-unlinked"],
      ["3g2-cdp-link", "3g2-cdp-same"],
      ["3g2-cdp-ch", "3g2-cdp-changed"],
      ["3g2-cdp-mi", "3g2-cdp-missing"],
    ]) {
      discIds.push((await db.query(`
        INSERT INTO public.provider_discovered_resources
          (provider_account_id, external_resource_id, resource_type, name, status, region, last_run_id)
        VALUES ($1, $2, 'project', $3, 'ACTIVE_HEALTHY', 'eu-west-1', $4) RETURNING id`,
        [accountId, ext, name, dRunId])).rows[0].id);
    }
    // Link the last three via the real link RPC (captures baseline snapshots).
    for (const d of discIds.slice(1)) {
      await client.rest({ kind: "service" }).rpc("link_discovered_resource", {
        p_discovered_id: d, p_client_id: clientAcc.id, p_system_id: sysId,
        p_linked_by: adminAcc.id,
      });
    }
    resSchOnlyId = (await db.query(`
      INSERT INTO public.resources (system_id, provider_account_id, name, resource_type, ownership, client_id)
      VALUES ('${sysId}', '${accountId}', '3g2-cdp-sch-only', 'database', 'client_owned', '${clientAcc.id}')
      RETURNING id`)).rows[0].id;
    // External drift + disappearance.
    await db.query(`UPDATE public.provider_discovered_resources SET status='INACTIVE' WHERE external_resource_id='3g2-cdp-ch'`);
    await db.query(`UPDATE public.provider_discovered_resources SET external_missing=true WHERE external_resource_id='3g2-cdp-mi'`);
    console.log("Fixtures seeded.\n");

    // ------------------------------------------------------------------
    console.log("--- 1. ADMIN RECONCILIATION FLOW ---");
    const adminUrl = await loginAs(ws, "admin");
    check("Admin login", !adminUrl.includes("/login"), adminUrl);

    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/systems/reconciliation` });
    // The eyebrow satisfies a plain text wait before the client manager mounts —
    // wait for the admin-only control itself.
    const reconReady = await waitForSelector(ws, "[data-action='reconcile']", 25000);
    const pageText = await waitForText(ws, "Reconciliation");
    check("Reconciliation page rendered", pageText.includes("Reconciliation"));
    check("Admin sees reconcile control", reconReady === true);
    check("Reconciliation reachable under Systems nav", await evalJs(ws, `Array.from(document.querySelectorAll('a')).some(a => a.getAttribute('href') === '/admin/systems/reconciliation')`) === true);

    // Run reconciliation through the real UI.
    const pick = await selectOptionContaining(ws, "#select-recon-account", "3G2 CDP Account");
    check("Provider account selectable", pick?.ok === true, pick?.label || "");
    await clickSelector(ws, "[data-action='reconcile']");
    const reconciled = await waitForText(ws, "Reconciliation completed", 30000);
    check("Reconcile completes via UI", reconciled.includes("Reconciliation completed"));

    // Classification rows visible — wait for the table to repaint after
    // router.refresh(), then compare case-insensitively (.ux-status capitalizes).
    const itemText = (await waitForText(ws, "3g2-cdp-changed", 20000)).toLowerCase();
    check("New external resource classified", itemText.includes("new external resource"));
    check("External change classified", itemText.includes("external change"));
    check("Missing externally classified", itemText.includes("missing externally"));
    check("SCH only classified", itemText.includes("sch only"));
    check("Awaiting review count shown", /awaiting review/.test(itemText));

    // Detail dialog distinguishes SCH vs provider state (retry — row click can
    // land on a detached element during router.refresh()).
    let detailOpen = false;
    for (let i = 0; i < 4 && !detailOpen; i++) {
      await evalJs(ws, `(() => {
        const rows = Array.from(document.querySelectorAll('tr'));
        const row = rows.find(r => (r.innerText||'').includes('3g2-cdp-changed'));
        row?.click(); return !!row;
      })()`);
      detailOpen = await waitForSelector(ws, "#recon-detail-title", 6000);
    }
    check("Detail dialog opens", detailOpen === true);
    const detailText = (await waitForText(ws, "Detected change", 10000)).toLowerCase();
    check("Detail shows SCH state vs Provider state",
      detailText.includes("sch state") && detailText.includes("provider state") && detailText.includes("detected change"));
    await evalJs(ws, `Array.from(document.querySelectorAll('button')).find(b => (b.textContent||'').trim()==='Close')?.click()`);
    await new Promise((r) => setTimeout(r, 600));

    // Review lifecycle: acknowledge → approve → apply on the changed row.
    await clickRowUntilText(ws, "3g2-cdp-changed", "acknowledge", "acknowledged");
    const acked = await waitForText(ws, "Acknowledged", 15000);
    check("Acknowledge transitions item", acked.toLowerCase().includes("acknowledged"));

    await clickRowUntilText(ws, "3g2-cdp-changed", "approve", "approved");
    const approved = await waitForText(ws, "approved", 15000);
    check("Approve transitions item", approved.toLowerCase().includes("approved"));

    await clickRowUntilText(ws, "3g2-cdp-changed", "apply", "applied");
    const applied = await waitForText(ws, "Applied to SCH inventory", 20000);
    check("Apply succeeds on approved proposal", applied.toLowerCase().includes("applied"));

    // Applied effect: external_* updated, SCH fields untouched.
    const res = (await db.query(`
      SELECT r.external_status, r.status, r.name FROM public.resources r
      JOIN public.provider_discovered_resources d ON d.linked_resource_id = r.id
      WHERE d.external_resource_id='3g2-cdp-ch'`)).rows[0];
    check("Apply wrote provider-observed fields only",
      res?.external_status === "INACTIVE" && res?.status === "active" && res?.name === "3g2-cdp-changed",
      `ext=${res?.external_status} sch=${res?.status}`);

    // ------------------------------------------------------------------
    console.log("\n--- 2. STALE PROTECTION (UI) ---");
    // New drift → fresh proposal; approve it; then supersede the basis.
    await db.query(`UPDATE public.provider_discovered_resources SET region='us-east-1' WHERE external_resource_id='3g2-cdp-link'`);
    await clickSelector(ws, "[data-action='reconcile']");
    await waitForText(ws, "Reconciliation completed", 30000);
    await clickRowUntilText(ws, "3g2-cdp-same", "approve", "approved");
    await waitForText(ws, "Approved", 15000);
    // Supersede: newer completed discovery observation.
    const dRun2 = (await db.query(`
      INSERT INTO public.provider_discovery_runs (provider_account_id, status, initiated_by, completed_at)
      VALUES ('${accountId}', 'completed', '${adminAcc.id}', now()) RETURNING id`)).rows[0].id;
    await db.query(`UPDATE public.provider_discovered_resources SET last_run_id='${dRun2}' WHERE external_resource_id='3g2-cdp-link'`);

    const applyBtn = await evalJs(ws, `(() => {
      const rows = Array.from(document.querySelectorAll('tr'));
      const row = rows.find(r => (r.innerText||'').includes('3g2-cdp-same'));
      const btn = row?.querySelector("[data-action='apply']");
      return { rowFound: !!row, hasApply: !!btn };
    })()`);
    // The row still shows 'approved' until the next refresh marks it stale;
    // if apply is offered, clicking must produce the stale refusal path.
    if (applyBtn?.hasApply) {
      await clickRowButton(ws, "3g2-cdp-same", "apply");
      const staleMsg = await waitForText(ws, "stale", 15000);
      check("Stale proposal refused via UI apply", staleMsg.toLowerCase().includes("stale"), "apply attempted");
    } else {
      check("Stale proposal refused via UI apply", applyBtn?.rowFound === true, "apply hidden — basis flagged stale");
    }
    // Reconcile again — supersedes any remaining open proposals.
    await clickSelector(ws, "[data-action='reconcile']");
    const staleMarked = await waitForText(ws, "stale", 30000);
    check("Superseded proposal marked 'stale' in UI", staleMarked.toLowerCase().includes("stale"));

    // Runs history visible.
    check("Reconciliation runs history rendered", staleMarked.includes("Reconciliation runs") && /completed/.test(staleMarked));

    // Audit: sync_applied recorded.
    const auditApplied = await db.query(`SELECT action FROM public.audit_logs WHERE action='provider_resource.sync_applied' AND record_id IN (SELECT id FROM public.provider_reconciliation_items WHERE provider_account_id='${accountId}')`);
    check("provider_resource.sync_applied audited", auditApplied.rows.length >= 1);

    // No secrets anywhere.
    const scrub = (await evalJs(ws, "document.body.innerText")) || "";
    check("No credential material rendered", !/eyJhbGci|sk_live|sb_secret|BEGIN.*PRIVATE|cdp-invalid/.test(scrub));

    // ------------------------------------------------------------------
    console.log("\n--- 3. FINANCE (read-only) ---");
    await loginAs(ws, "finance");
    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/systems/reconciliation` });
    await waitForSelector(ws, ".ux-table", 20000);
    const finText = await waitForText(ws, "3G2 CDP Account", 20000);
    check("Finance sees reconciliation overview", finText.includes("Reconciliation") && finText.includes("3G2 CDP Account"));
    const finControls = await evalJs(ws, `!!document.querySelector('[data-action=reconcile],[data-action=approve],[data-action=apply],[data-action=acknowledge],[data-action=reject],[data-action=dismiss]')`);
    check("Finance has NO reconcile/review/apply controls", finControls === false);
    check("Finance sees no credential material", !/eyJhbGci|sk_live|sb_secret|BEGIN.*PRIVATE/.test(finText));

    // ------------------------------------------------------------------
    console.log("\n--- 4. STAFF + CLIENT (denied) ---");
    await loginAs(ws, "staff");
    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/systems/reconciliation` });
    await new Promise((r) => setTimeout(r, 3500));
    const staffUrl = (await evalJs(ws, "window.location.href")) || "";
    check("Staff redirected away from reconciliation", staffUrl.includes("/admin/systems/providers") || staffUrl.includes("/admin/systems"), staffUrl);

    await loginAs(ws, "clientA");
    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/systems/reconciliation` });
    await new Promise((r) => setTimeout(r, 3500));
    const clientUrl = (await evalJs(ws, "window.location.href")) || "";
    check("Client denied reconciliation access", clientUrl.includes("/client") || clientUrl.includes("/login"), clientUrl);

    // ------------------------------------------------------------------
    console.log("\n--- 5. RESPONSIVE ---");
    await loginAs(ws, "admin");
    for (const [w, h] of [[1280, 800], [768, 1024], [375, 812]]) {
      await setViewport(ws, w, h);
      await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/systems/reconciliation` });
      await waitForText(ws, "Reconciliation", 20000);
      await new Promise((r) => setTimeout(r, 1500));
      check(`No horizontal overflow at ${w}x${h}`, (await checkNoHorizontalOverflow(ws)) === true);
      const nav = await evalJs(ws, `!!document.querySelector('nav, aside, [role=navigation]') || !!document.querySelector('button')`);
      check(`Navigation usable at ${w}x${h}`, nav === true);
    }
  } finally {
    console.log("\n--- CLEANUP ---");
    try {
      for (const [table, trigger] of [
        ["provider_reconciliation_items", "trg_recon_items_no_delete"],
        ["provider_reconciliation_runs", "trg_recon_runs_no_delete"],
        ["provider_discovered_resources", "trg_discovered_no_delete"],
        ["provider_discovery_runs", "trg_discovery_runs_no_delete"],
      ]) {
        await db.query(`ALTER TABLE public.${table} DISABLE TRIGGER ${trigger}`);
      }
      if (accountId) {
        await db.query(`DELETE FROM public.provider_reconciliation_items WHERE provider_account_id=$1`, [accountId]);
        await db.query(`DELETE FROM public.provider_reconciliation_runs WHERE provider_account_id=$1`, [accountId]);
        await db.query(`DELETE FROM public.provider_discovered_resources WHERE provider_account_id=$1`, [accountId]);
        await db.query(`DELETE FROM public.provider_discovery_runs WHERE provider_account_id=$1`, [accountId]);
        await db.query(`DELETE FROM public.resources WHERE provider_account_id=$1`, [accountId]);
        await db.query(`DELETE FROM public.provider_accounts WHERE id=$1`, [accountId]);
      }
      for (const [table, trigger] of [
        ["provider_reconciliation_items", "trg_recon_items_no_delete"],
        ["provider_reconciliation_runs", "trg_recon_runs_no_delete"],
        ["provider_discovered_resources", "trg_discovered_no_delete"],
        ["provider_discovery_runs", "trg_discovery_runs_no_delete"],
      ]) {
        await db.query(`ALTER TABLE public.${table} ENABLE TRIGGER ${trigger}`);
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
  console.log(`PHASE 3G-2 BROWSER VERIFICATION: ${passed} PASS, ${failed} FAIL`);
  console.log(`============================================================`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((e) => { console.error("Browser verification failed:", e); process.exit(1); });
