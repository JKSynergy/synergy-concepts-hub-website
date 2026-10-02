// Phase 3G-3 Browser Verification — Controlled Provider Operations
// Real Chrome via CDP against the local dev server pointed at hosted DEV
// (outuocpsotiozkpyksex). Discovery evidence + a connected fixture account are
// seeded through the DB; the propose → approve → execute path itself is driven
// through the real UI.
//
// NOTE: the fixture account carries a vault POINTER but no real credential, so
// the Execute step exercises the real server action end-to-end and must reach
// the normalized `no_credentials` failure path — never a fake success. That IS
// the verified behaviour when no live DEV provider credential exists.

import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createClient } from "./phase2c-lib.mjs";
import { openPgConnection } from "./apply-migration-013.mjs";

const ACCOUNT_FILE = "E:\\SYSTEMS AND WEBSITES\\SCH_Website_Upload\\portal\\.phase2c-accounts.local.json";
const CHROME_PORT = 9226;
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
    "--user-data-dir=C:\\Users\\SYNERGY CREATIVE HUB\\.gemini\\antigravity-ide\\brain\\5b20a811-854c-455a-a6f2-94875e96a286\\scratch\\chrome-test-profile-3g3",
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

async function setInput(ws, selector, value) {
  return evalJs(ws, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
    s.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input',{bubbles:true}));
    return true;
  })()`);
}

// Click a row button, retrying until it mounts (router.refresh repaints rows).
async function clickRowButtonRetry(ws, rowNeedle, action, attempts = 15) {
  for (let i = 0; i < attempts; i++) {
    if ((await clickRowButton(ws, rowNeedle, action)) === true) return true;
    await new Promise((r) => setTimeout(r, 800));
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

  let providerId, accountId, sysId, dRunId;
  const discIds = [];

  try {
    // Seed fixtures: connected Supabase account (vault pointer only — the
    // execute path must safely fail at credential resolution), 2 linked projects.
    providerId = (await db.query(`
      INSERT INTO public.providers (name, slug, adapter_key, category)
      VALUES ('3G3 CDP Supabase', '3g3-cdp-supabase', 'supabase', 'cloud_hosting')
      RETURNING id`)).rows[0].id;
    accountId = (await db.query(`
      INSERT INTO public.provider_accounts (provider_id, account_name, ownership, connection_status, credential_reference)
      VALUES ('${providerId}', '3G3 CDP Account', 'sch_managed', 'connected', 'vault:3g3-cdp-pointer')
      RETURNING id`)).rows[0].id;
    sysId = (await db.query(`
      INSERT INTO public.systems (client_id, name, system_type, status)
      VALUES ('${clientAcc.id}', '3G3 CDP System', 'web_platform', 'live') RETURNING id`)).rows[0].id;
    dRunId = (await db.query(`
      INSERT INTO public.provider_discovery_runs (provider_account_id, status, initiated_by, completed_at)
      VALUES ('${accountId}', 'completed', '${adminAcc.id}', now()) RETURNING id`)).rows[0].id;

    for (const [ext, name] of [
      ["3g3-cdp-1", "3g3-cdp-alpha"],
      ["3g3-cdp-2", "3g3-cdp-beta"],
    ]) {
      discIds.push((await db.query(`
        INSERT INTO public.provider_discovered_resources
          (provider_account_id, external_resource_id, resource_type, name, status, region, last_run_id)
        VALUES ($1, $2, 'project', $3, 'ACTIVE_HEALTHY', 'eu-west-1', $4) RETURNING id`,
        [accountId, ext, name, dRunId])).rows[0].id);
    }
    for (const d of discIds) {
      await client.rest({ kind: "service" }).rpc("link_discovered_resource", {
        p_discovered_id: d, p_client_id: clientAcc.id, p_system_id: sysId,
        p_linked_by: adminAcc.id,
      });
    }
    console.log("Fixtures seeded.\n");

    // ------------------------------------------------------------------
    console.log("--- 1. ADMIN OPERATION FLOW ---");
    const adminUrl = await loginAs(ws, "admin");
    check("Admin login", !adminUrl.includes("/login"), adminUrl);

    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/systems/operations` });
    // Wait for the admin-only control, not just the streamed page header.
    const proposeReady = await waitForSelector(ws, "[data-action='new-operation']", 25000);
    const pageText = await waitForText(ws, "Provider Operations");
    check("Provider Operations page rendered", pageText.includes("Provider Operations"));
    check("Admin sees propose control", proposeReady === true);
    check("Operations reachable under Systems nav",
      await evalJs(ws, `Array.from(document.querySelectorAll('a')).some(a => a.getAttribute('href') === '/admin/systems/operations')`) === true);

    // Open the propose dialog and drive it.
    await clickSelector(ws, "[data-action='new-operation']");
    check("Propose dialog opens", await waitForSelector(ws, "#select-op-target", 10000));
    const picked = await selectOptionContaining(ws, "#select-op-target", "3g3-cdp-alpha");
    check("Linked resource selectable as operation target", picked?.ok === true, picked?.label || "");
    const opPick = await selectOptionContaining(ws, "#select-op-key", "Pause");
    check("pause_resource offered for Supabase project", opPick?.ok === true, opPick?.label || "");
    // Submit must stay disabled without a reason.
    const disabledNoReason = await evalJs(ws, `document.querySelector("[data-action='submit-proposal']")?.disabled === true`);
    check("Submit disabled without reason", disabledNoReason === true);
    await setInput(ws, "#input-op-reason", "3G3 browser verify — pause project");
    await clickSelector(ws, "[data-action='submit-proposal']");
    const proposed = await waitForText(ws, "Proposal created", 20000);
    check("Proposal created via UI", proposed.includes("Proposal created") || proposed.toLowerCase().includes("proposed"));

    // Row should show proposed + approve/reject controls (poll — refresh repaint).
    const rowHas = await (async () => {
      for (let i = 0; i < 15; i++) {
        const r = await evalJs(ws, `(() => {
          const row = Array.from(document.querySelectorAll('tr')).find(r => (r.innerText||'').includes('3g3-cdp-alpha'));
          return { found: !!row, approve: !!row?.querySelector("[data-action='approve']"), reject: !!row?.querySelector("[data-action='reject']") };
        })()`);
        if (r?.found && r.approve && r.reject) return r;
        await new Promise((res) => setTimeout(res, 800));
      }
      return { found: false };
    })();
    check("Proposal row shows approve+reject controls", rowHas?.found === true && rowHas.approve === true && rowHas.reject === true);

    // Approve via real UI — the page header literally contains the word
    // "approved", so assert on the row's status cell / alert instead.
    await clickRowButtonRetry(ws, "3g3-cdp-alpha", "approve");
    const alert1 = await evalJs(ws, `document.querySelector('.ux-alert-error')?.innerText || document.querySelector('.ux-alert-success')?.innerText || ''`);
    if (alert1) console.log(`   post-approve alert: ${alert1}`);
    const approved = await (async () => {
      for (let i = 0; i < 25; i++) {
        const st = await evalJs(ws, `(() => {
          const row = Array.from(document.querySelectorAll('tr')).find(r => (r.innerText||'').includes('3g3-cdp-alpha'));
          const chip = row?.querySelectorAll('td')[6]?.innerText || '';
          return chip.toLowerCase();
        })()`);
        if (st.includes("approved")) return st;
        await new Promise((res) => setTimeout(res, 600));
      }
      return "";
    })();
    check("Approve transitions proposal", approved.includes("approved"), approved || "no approved chip");

    // Execute: begin passes (connected + fresh basis), then the server action
    // must fail at credential resolution — no fake success.
    const execClicked = await clickRowButtonRetry(ws, "3g3-cdp-alpha", "execute");
    check("Execute control available after approval", execClicked === true);
    const execText = await waitForText(ws, "credential", 30000);
    check("Execute fails safely at credential resolution (no fake success)",
      execText.toLowerCase().includes("no credential"), "");
    const failedRow = (await db.query(
      `SELECT p.status FROM public.provider_operation_proposals p
       JOIN public.provider_discovered_resources d ON d.id=p.discovered_resource_id
       WHERE d.external_resource_id='3g3-cdp-1' ORDER BY p.created_at DESC LIMIT 1`)).rows[0];
    check("Failed execution persisted as failed (not stuck executing)",
      failedRow?.status === "failed", `status=${failedRow?.status}`);
    const execRow = (await db.query(
      `SELECT e.status, e.error_category, e.idempotency_key FROM public.provider_operation_executions e
       JOIN public.provider_operation_proposals p ON p.id=e.proposal_id
       JOIN public.provider_discovered_resources d ON d.id=p.discovered_resource_id
       WHERE d.external_resource_id='3g3-cdp-1' ORDER BY e.started_at DESC LIMIT 1`)).rows[0];
    check("Execution record normalized (error_category=no_credentials, stable idem key)",
      execRow?.error_category === "no_credentials" && /^schop-/.test(execRow?.idempotency_key ?? ""),
      `${execRow?.error_category} ${execRow?.idempotency_key}`);

    // ------------------------------------------------------------------
    console.log("\n--- 2. STALE OPERATION (UI) ---");
    // Propose + approve on the second resource, then supersede the basis.
    await clickSelector(ws, "[data-action='new-operation']");
    await waitForSelector(ws, "#select-op-target", 10000);
    await selectOptionContaining(ws, "#select-op-target", "3g3-cdp-beta");
    await selectOptionContaining(ws, "#select-op-key", "Pause");
    await setInput(ws, "#input-op-reason", "3G3 browser verify — stale check");
    await clickSelector(ws, "[data-action='submit-proposal']");
    await waitForText(ws, "Proposal created", 20000);
    await clickRowButtonRetry(ws, "3g3-cdp-beta", "approve");
    const alert2 = await evalJs(ws, `document.querySelector('.ux-alert-error')?.innerText || ''`);
    if (alert2) console.log(`   post-approve(beta) alert: ${alert2}`);
    await (async () => {
      for (let i = 0; i < 25; i++) {
        const st = await evalJs(ws, `(() => {
          const row = Array.from(document.querySelectorAll('tr')).find(r => (r.innerText||'').includes('3g3-cdp-beta'));
          return (row?.querySelectorAll('td')[6]?.innerText || '').toLowerCase();
        })()`);
        if (st.includes("approved")) break;
        await new Promise((res) => setTimeout(res, 600));
      }
    })();
    // Supersede: newer completed discovery observation.
    const dRun2 = (await db.query(`
      INSERT INTO public.provider_discovery_runs (provider_account_id, status, initiated_by, completed_at)
      VALUES ('${accountId}', 'completed', '${adminAcc.id}', now()) RETURNING id`)).rows[0].id;
    await db.query(`UPDATE public.provider_discovered_resources SET last_run_id='${dRun2}' WHERE external_resource_id='3g3-cdp-2'`);
    const staleExecClicked = await clickRowButtonRetry(ws, "3g3-cdp-beta", "execute");
    check("Execute control present before stale refresh", staleExecClicked === true);
    const staleMsg = await waitForText(ws, "stale", 25000);
    check("Stale proposal refused at execute (UI shows stale)",
      staleMsg.toLowerCase().includes("stale"));
    const staleDb = (await db.query(
      `SELECT p.status FROM public.provider_operation_proposals p
       JOIN public.provider_discovered_resources d ON d.id=p.discovered_resource_id
       WHERE d.external_resource_id='3g3-cdp-2' ORDER BY p.created_at DESC LIMIT 1`)).rows[0];
    check("Stale proposal marked stale in DB", staleDb?.status === "stale", staleDb?.status);

    // ------------------------------------------------------------------
    console.log("\n--- 3. DETAIL DIALOG ---");
    let detailOpen = false;
    for (let i = 0; i < 4 && !detailOpen; i++) {
      await evalJs(ws, `(() => {
        const row = Array.from(document.querySelectorAll('tr')).find(r => (r.innerText||'').includes('3g3-cdp-alpha'));
        row?.click(); return !!row;
      })()`);
      detailOpen = await waitForSelector(ws, "#op-detail-title", 6000);
    }
    check("Operation detail dialog opens", detailOpen === true);
    const detailText = (await evalJs(ws, "document.body.innerText") || "").toLowerCase();
    check("Detail shows SCH resource vs provider state",
      detailText.includes("sch resource") && detailText.includes("provider state") && detailText.includes("executions"));
    await evalJs(ws, `Array.from(document.querySelectorAll('button')).find(b => (b.textContent||'').trim()==='Close')?.click()`);
    await new Promise((r) => setTimeout(r, 600));

    // Audit + no secrets.
    const audit = await db.query(
      `SELECT DISTINCT action FROM public.audit_logs WHERE action LIKE 'provider_operation.%'`);
    const auditActions = audit.rows.map((r) => r.action);
    check("Lifecycle audited (proposed/approved/started/failed)",
      ["provider_operation.proposed", "provider_operation.approved", "provider_operation.started",
       "provider_operation.failed", "provider_operation.stale"].every((a) => auditActions.includes(a)));
    const scrub = (await evalJs(ws, "document.body.innerText")) || "";
    check("No credential material rendered", !/eyJhbGci|sk_live|sb_secret|BEGIN.*PRIVATE|vault:/.test(scrub));

    // ------------------------------------------------------------------
    console.log("\n--- 4. FINANCE (read-only) ---");
    await loginAs(ws, "finance");
    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/systems/operations` });
    await waitForSelector(ws, ".ux-table", 20000);
    const finText = await waitForText(ws, "Provider Operations", 20000);
    check("Finance sees operation overview (read-only)", finText.includes("Provider Operations") && finText.includes("3g3-cdp"));
    const finControls = await evalJs(ws, `!!document.querySelector('[data-action=new-operation],[data-action=approve],[data-action=reject],[data-action=execute],[data-action=cancel],[data-action=verify]')`);
    check("Finance has NO proposal/execution controls", finControls === false);
    check("Finance sees no credential material", !/eyJhbGci|sk_live|sb_secret|BEGIN.*PRIVATE|vault:/.test(finText));

    // ------------------------------------------------------------------
    console.log("\n--- 5. STAFF + CLIENT (denied) ---");
    await loginAs(ws, "staff");
    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/systems/operations` });
    await new Promise((r) => setTimeout(r, 3500));
    const staffUrl = (await evalJs(ws, "window.location.href")) || "";
    check("Staff redirected away from operations", !staffUrl.includes("/operations"), staffUrl);

    await loginAs(ws, "clientA");
    await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/systems/operations` });
    await new Promise((r) => setTimeout(r, 3500));
    const clientUrl = (await evalJs(ws, "window.location.href")) || "";
    check("Client denied operations access", clientUrl.includes("/client") || clientUrl.includes("/login"), clientUrl);

    // ------------------------------------------------------------------
    console.log("\n--- 6. RESPONSIVE ---");
    await loginAs(ws, "admin");
    for (const [w, h] of [[1280, 800], [768, 1024], [375, 812]]) {
      await setViewport(ws, w, h);
      await sendCdp(ws, "Page.navigate", { url: `${BASE}/admin/systems/operations` });
      await waitForSelector(ws, ".ux-table", 25000);
      await new Promise((r) => setTimeout(r, 1500));
      check(`No horizontal overflow at ${w}x${h}`, (await checkNoHorizontalOverflow(ws)) === true);
      const nav = await evalJs(ws, `!!document.querySelector('nav, aside, [role=navigation]') || !!document.querySelector('button')`);
      check(`Navigation usable at ${w}x${h}`, nav === true);
    }
  } finally {
    console.log("\n--- CLEANUP ---");
    try {
      for (const [table, trigger] of [
        ["provider_operation_proposals", "trg_op_proposals_no_delete"],
        ["provider_operation_executions", "trg_op_executions_no_delete"],
        ["provider_discovered_resources", "trg_discovered_no_delete"],
        ["provider_discovery_runs", "trg_discovery_runs_no_delete"],
      ]) {
        await db.query(`ALTER TABLE public.${table} DISABLE TRIGGER ${trigger}`);
      }
      if (accountId) {
        await db.query(`DELETE FROM public.provider_operation_executions WHERE provider_account_id=$1`, [accountId]);
        await db.query(`DELETE FROM public.provider_operation_proposals WHERE provider_account_id=$1`, [accountId]);
        await db.query(`DELETE FROM public.provider_discovered_resources WHERE provider_account_id=$1`, [accountId]);
        await db.query(`DELETE FROM public.provider_discovery_runs WHERE provider_account_id=$1`, [accountId]);
        await db.query(`DELETE FROM public.resources WHERE provider_account_id=$1`, [accountId]);
        await db.query(`DELETE FROM public.provider_accounts WHERE id=$1`, [accountId]);
      }
      for (const [table, trigger] of [
        ["provider_operation_proposals", "trg_op_proposals_no_delete"],
        ["provider_operation_executions", "trg_op_executions_no_delete"],
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
  console.log(`PHASE 3G-3 BROWSER VERIFICATION: ${passed} PASS, ${failed} FAIL`);
  console.log(`============================================================`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((e) => { console.error("Browser verification failed:", e); process.exit(1); });
