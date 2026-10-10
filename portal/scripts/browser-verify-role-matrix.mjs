// Role-Matrix Browser Verification — real Chrome via CDP against the local
// dev server pointed at hosted DEV (outuocpsotiozkpyksex).
//
// Verifies the hardened Operations + provider workspaces as each role:
//   /admin/operations[/incidents|backups|suspensions|tasks|action-center|provider-actions]
//   /admin/systems/monitoring, /admin/systems/reconciliation
//
// Assertions are structural (titles, section markers, button presence,
// redirects) — they hold whether DEV data is empty or populated. No real
// provider operations are triggered; read-only navigation only. Credentials
// come from .phase2c-accounts.local.json and are never printed.

import { readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { startDevServer } from "./phase2c-dev-server.mjs";

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
  const deadline = Date.now() + 45000;
  let url = "", lastBody = null, stableSince = null;
  while (Date.now() < deadline) {
    const swapped = (await evalJs(ws, "typeof window.__schNavToken === 'undefined'")) === true;
    url = (await evalJs(ws, "window.location.href")) || "";
    const body = swapped ? ((await evalJs(ws, "document.body ? document.body.innerText : ''")) || "") : "";
    if (swapped && new URL(url, BASE).pathname === path && body.toLowerCase().includes(marker.toLowerCase())) {
      // RSC streams the shell (nav contains marker text) before content —
      // wait until the rendered body stops changing.
      if (body === lastBody && stableSince && Date.now() - stableSince > 700) return { body, url };
      if (body !== lastBody) { lastBody = body; stableSince = Date.now(); }
    }
    await new Promise((r) => setTimeout(r, 350));
  }
  const body = lastBody ?? ((await evalJs(ws, "document.body ? document.body.innerText : ''")) || "");
  return { body, url };
}

const has = (body, s) => body.toLowerCase().includes(s.toLowerCase());
const sel = (ws, s) => evalJs(ws, `!!document.querySelector(${JSON.stringify(s)})`);
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
  console.log("Starting dev server against hosted DEV…");
  const child = await startDevServer({ env: loadEnv() });
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
          check(`${role} tasks: no create control`, !(await sel(ws, "#btn-create-task")));
        }
        if (path === "/admin/systems/monitoring" && role === "admin") {
          check(`${role} monitoring: schedules section renders`, has(body, "Monitoring schedules"));
        }
        if (path === "/admin/systems/monitoring" && role === "finance") {
          check(`${role} monitoring: no mutation controls`, !(await sel(ws, "[data-action='add-schedule']")) && !(await sel(ws, "[data-action='run-now']")));
        }
        if (path === "/admin/operations/provider-actions" && role === "admin") {
          check(`${role} provider-actions: propose control`, await sel(ws, "[data-action='new-operation']"));
        }
        if (path === "/admin/operations/provider-actions" && role === "finance") {
          check(`${role} provider-actions: read-only (no propose)`, !(await sel(ws, "[data-action='new-operation']")));
        }
        if (path === "/admin/operations/action-center" && role === "finance") {
          check(`${role} action-center: no review buttons`, !(await sel(ws, "[data-action='acknowledge']")));
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
