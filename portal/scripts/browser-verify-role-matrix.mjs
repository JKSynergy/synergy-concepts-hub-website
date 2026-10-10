// Role-Matrix Browser Verification — real Chrome via CDP.
//
// Local mode (default): boots `next dev` against hosted DEV
// (outuocpsotiozkpyksex) via the guarded phase2c launcher and reads
// .phase2c-accounts.local.json.
//
// Remote mode: MATRIX_BASE=https://portal.synergyconceptshub.com targets the
// deployed portal directly — no dev server is started. Remote runs require
// two fail-closed confirmations:
//   MATRIX_CONFIRM_TARGET     must equal the base hostname (e.g. portal.synergyconceptshub.com)
//   MATRIX_EXPECT_SUPABASE_REF  project ref the target's CSP must name (e.g. unnwuiruhgmorwhkiugu)
// Credentials come from MATRIX_ACCOUNTS (a gitignored local JSON in the same
// shape as the DEV accounts file) and are never printed.
//
// Verifies the hardened Operations + provider workspaces as each role:
//   /admin/operations[/incidents|backups|suspensions|tasks|action-center|provider-actions]
//   /admin/systems/monitoring, /admin/systems/reconciliation
//
// Assertions are structural (titles, section markers, button presence,
// redirects) — read-only navigation only. No acknowledgement, resolve,
// dismiss, suspend, approve, execute, verify, or delete control is clicked.

import { readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { startDevServer } from "./phase2c-dev-server.mjs";

const CHROME_PORT = 9231;
const BASE = process.env.MATRIX_BASE || "http://localhost:3000";
const IS_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(BASE);
const ACCOUNT_FILE = process.env.MATRIX_ACCOUNTS
  || "E:\\SYSTEMS AND WEBSITES\\SCH_Website_Upload\\portal\\.phase2c-accounts.local.json";

// Remote mode only — refuse to run unless the operator explicitly confirmed
// the hostname AND the deployed site proves it targets the expected Supabase
// project (prevents silently testing a preview or DEV deployment).
async function confirmRemoteTarget() {
  const host = new URL(BASE).hostname;
  const confirm = process.env.MATRIX_CONFIRM_TARGET;
  if (confirm !== host) {
    throw new Error(`Remote mode refused: set MATRIX_CONFIRM_TARGET=${host} to confirm you intend to test ${BASE}.`);
  }
  const expectedRef = process.env.MATRIX_EXPECT_SUPABASE_REF;
  if (!expectedRef) {
    throw new Error("Remote mode refused: set MATRIX_EXPECT_SUPABASE_REF to the Supabase project ref the target must use.");
  }
  let res = null, lastErr = null;
  for (let attempt = 0; attempt < 4 && !res; attempt++) {
    try {
      res = await fetch(`${BASE}/login`, { redirect: "manual", signal: AbortSignal.timeout(20000) });
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  if (!res) throw new Error(`Could not reach ${BASE} after 4 attempts: ${lastErr?.message}`);
  const csp = res.headers.get("content-security-policy-report-only") || "";
  const hosts = new Set([...csp.matchAll(/(?:https|wss):\/\/([a-z0-9-]+)\.supabase\.co/gi)].map((m) => m[1].toLowerCase()));
  if (!hosts.has(expectedRef.toLowerCase())) {
    throw new Error(`Remote mode refused: ${BASE} targets Supabase [${[...hosts].join(", ") || "none"}], not ${expectedRef}.`);
  }
  console.log(`Remote target confirmed: ${BASE} -> Supabase ${expectedRef}`);
}

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
    "--user-data-dir=C:\\Users\\SYNERGY CREATIVE HUB\\.gemini\\antigravity-ide\\brain\\5b20a811-854c-455a-a6f2-94875e96a286\\scratch\\chrome-test-profile-matrix",
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
  const page = list.find((p) => p.type === "page");
  if (!page) throw new Error("No page target");
  return page.webSocketDebuggerUrl;
}

async function sendCdp(ws, method, params = {}) {
  const id = Math.floor(Math.random() * 1000000);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout ${method}`)), 30000);
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

async function waitForText(ws, text, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const body = (await evalJs(ws, "document.body.innerText")) || "";
    if (body.includes(text)) return body;
    await new Promise((r) => setTimeout(r, 400));
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
  return url;
}

async function visit(ws, path, marker) {
  // Tag the current document so we can tell when the NEW document has swapped
  // in — location.href updates before the DOM is replaced, and nav link text
  // can contain marker strings, causing stale-body reads.
  await evalJs(ws, "window.__schNavToken = '1'");
  await sendCdp(ws, "Page.navigate", { url: `${BASE}${path}` });
  // Read only the page-content container — nav link text can contain marker
  // strings ("Provider Actions", "Operations") and the shell streams first.
  const contentJs = "document.querySelector('.ux-page')?.innerText ?? document.body?.innerText ?? ''";
  const deadline = Date.now() + 45000;
  let url = "", lastBody = null, stableSince = null;
  while (Date.now() < deadline) {
    const swapped = (await evalJs(ws, "typeof window.__schNavToken === 'undefined'")) === true;
    url = (await evalJs(ws, "window.location.href")) || "";
    const body = swapped ? ((await evalJs(ws, contentJs)) || "") : "";
    if (swapped && new URL(url, BASE).pathname === path && body.toLowerCase().includes(marker.toLowerCase())) {
      // RSC streams in chunks — wait until the rendered content stops changing.
      if (body === lastBody && stableSince && Date.now() - stableSince > 700) return { body, url };
      if (body !== lastBody) { lastBody = body; stableSince = Date.now(); }
    }
    await new Promise((r) => setTimeout(r, 350));
  }
  const body = lastBody ?? ((await evalJs(ws, contentJs)) || "");
  return { body, url };
}

const has = (body, s) => body.toLowerCase().includes(s.toLowerCase());
const sel = (ws, s) => evalJs(ws, `!!document.querySelector(${JSON.stringify(s)})`);

// Element-mount waits. RSC streams the page text before client subtrees mount,
// so a one-shot selector query can run before the control exists (false FAIL
// on presence) or before it would have been denied (false PASS on absence).
async function waitSel(ws, selector, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await sel(ws, selector)) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}
// Proves the page subtree finished mounting without naming a specific element:
// poll the element count inside .ux-page until it is unchanged for ~1.2s.
async function waitDomStable(ws, timeoutMs = 15000) {
  const start = Date.now();
  let last = -1, stable = 0;
  while (Date.now() - start < timeoutMs) {
    const n = await evalJs(ws, "document.querySelector('.ux-page')?.querySelectorAll('*').length ?? -1");
    if (n === last && n >= 0) { if (++stable >= 4) return true; }
    else { stable = 0; last = n; }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}
const SECRET_RE = /(sk_live_|service_role|status_token|SUPABASE_SERVICE|api_key\s*[:=]\s*\S{20})/i;

// Expected behaviour per role per route. marker = text that proves the real
// workspace rendered (not the error boundary or a redirect away).
const MATRIX = {
  admin: {
    "/admin/operations": { marker: "Operations", expect: ["Action Center", "Provider decisions", "Provider monitoring", "Recent activity"] },
    "/admin/operations/incidents": { marker: "Incidents", expect: [] },
    "/admin/operations/backups": { marker: "Backup", expect: [] },
    "/admin/operations/suspensions": { marker: "Suspension", expect: [] },
    "/admin/operations/tasks": { marker: "Tasks", expect: [] },
    "/admin/operations/action-center": { marker: "Action Center", expect: [] },
    "/admin/operations/provider-actions": { marker: "Provider Actions", expect: [] },
    "/admin/systems/monitoring": { marker: "Provider Monitoring", expect: [] },
    "/admin/systems/reconciliation": { marker: "Reconciliation", expect: [] },
  },
  finance: {
    "/admin/operations": { marker: "Operations", expect: ["Action Center", "Provider decisions", "Provider monitoring"], forbid: ["Recent activity"] },
    "/admin/operations/incidents": { marker: "Incidents", expect: [] },
    "/admin/operations/backups": { marker: "Backup", expect: [] },
    "/admin/operations/suspensions": { marker: "Suspension", expect: [] },
    "/admin/operations/tasks": { marker: "Tasks", expect: [] },
    "/admin/operations/action-center": { marker: "Action Center", expect: [] },
    "/admin/operations/provider-actions": { marker: "Provider Actions", expect: [] },
    "/admin/systems/monitoring": { marker: "Provider Monitoring", expect: [] },
    "/admin/systems/reconciliation": { marker: "Reconciliation", expect: [] },
  },
  staff: {
    "/admin/operations": { marker: "Operations", expect: ["Action Center"], forbid: ["Provider decisions", "Provider monitoring", "Recent activity"] },
    "/admin/operations/incidents": { marker: "Incidents", expect: [] },
    "/admin/operations/backups": { marker: "Backup", expect: [] },
    "/admin/operations/suspensions": { marker: "Suspension", expect: [] },
    "/admin/operations/tasks": { marker: "Tasks", expect: [] },
    "/admin/operations/action-center": { marker: "Action Center", expect: [] },
    // Staff are redirected away from provider decision/monitoring surfaces.
    "/admin/operations/provider-actions": { marker: null, redirectTo: "/admin/systems/providers" },
    "/admin/systems/monitoring": { marker: null, redirectTo: "/admin/operations/action-center" },
    "/admin/systems/reconciliation": { marker: null, redirectTo: "/admin/systems/providers" },
  },
};

async function run() {
  let child = null;
  if (IS_LOCAL) {
    console.log("Starting dev server against hosted DEV…");
    child = await startDevServer({ env: loadEnv() });
  } else {
    console.log(`Remote mode: ${BASE} (no dev server started)`);
    await confirmRemoteTarget();
  }
  const results = [];
  const check = (name, cond, extra = "") => {
    console.log(`${cond ? "[PASS]" : "[FAIL]"} ${name}${extra ? " — " + extra : ""}`);
    results.push({ name, passed: !!cond });
  };

  try {
    console.log("Connecting to Chrome CDP…");
    const ws = new WebSocket(await getWsUrl());
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    console.log("Connected.\n");

    for (const role of ["admin", "finance", "staff"]) {
      console.log(`\n=== ROLE: ${role.toUpperCase()} ===`);
      const landing = await loginAs(ws, role);
      check(`${role} login via real form`, !landing.includes("/login"), `landed ${landing}`);

      for (const [path, rule] of Object.entries(MATRIX[role])) {
        if (rule.redirectTo) {
          await sendCdp(ws, "Page.navigate", { url: `${BASE}${path}` });
          let url = "";
          for (let i = 0; i < 30; i++) {
            await new Promise((r) => setTimeout(r, 400));
            url = (await evalJs(ws, "window.location.href")) || "";
            if (!url.endsWith(path)) break;
          }
          check(`${role} ${path} → redirect`, url.includes(rule.redirectTo), `landed ${url}`);
          continue;
        }

        const { body, url } = await visit(ws, path, rule.marker);
        const onRoute = url.includes(path);
        check(`${role} ${path} renders`, onRoute && has(body, rule.marker), has(body, "Unavailable") ? "page includes Unavailable" : "");
        if (!onRoute || !has(body, rule.marker)) continue;

        for (const marker of rule.expect) {
          check(`${role} ${path} shows ${marker}`, has(body, marker));
        }
        for (const denied of rule.forbid ?? []) {
          check(`${role} ${path} hides ${denied}`, !has(body, denied));
        }
        check(`${role} ${path} no error boundary`, !has(body, "Something went wrong"));
        check(`${role} ${path} no secrets`, !SECRET_RE.test(body));

        // Role-specific control visibility (UI-level; server-side denial is
        // covered by the action guards + PGlite suites).
        if (path === "/admin/operations/tasks" && role !== "admin") {
          const stable = await waitDomStable(ws);
          check(`${role} tasks: no create control`, !(await sel(ws, "#btn-create-task")),
            stable ? "" : "warning: DOM did not fully stabilize before absence check");
        }
        if (path === "/admin/systems/monitoring" && role === "admin") {
          check(`${role} monitoring: schedules section renders`, has(body, "Monitoring schedules"));
        }
        if (path === "/admin/systems/monitoring" && role === "finance") {
          const stable = await waitDomStable(ws);
          check(`${role} monitoring: no mutation controls`,
            !(await sel(ws, "[data-action='add-schedule']")) && !(await sel(ws, "[data-action='run-now']")),
            stable ? "" : "warning: DOM did not fully stabilize before absence check");
        }
        if (path === "/admin/operations/provider-actions" && role === "admin") {
          check(`${role} provider-actions: propose control`, await waitSel(ws, "[data-action='new-operation']"),
            "control did not mount within 15s");
        }
        if (path === "/admin/operations/provider-actions" && role === "finance") {
          const stable = await waitDomStable(ws);
          check(`${role} provider-actions: read-only (no propose)`, !(await sel(ws, "[data-action='new-operation']")),
            stable ? "" : "warning: DOM did not fully stabilize before absence check");
        }
        if (path === "/admin/operations/action-center" && role === "finance") {
          const stable = await waitDomStable(ws);
          check(`${role} action-center: no review buttons`, !(await sel(ws, "[data-action='acknowledge']")),
            stable ? "" : "warning: DOM did not fully stabilize before absence check");
        }
      }
    }

    const failed = results.filter((r) => !r.passed);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
    if (failed.length) {
      console.log("FAILED:");
      for (const f of failed) console.log(`  - ${f.name}`);
      process.exitCode = 1;
    }
  } finally {
    try {
      if (child && !child.killed && child.exitCode === null) {
        if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
        else child.kill("SIGTERM");
      }
    } catch {}
    process.exit(process.exitCode ?? 0);
  }
}

run().catch((e) => { console.error("Verification harness failed:", e.message); process.exit(1); });
