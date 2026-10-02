// Browser smoke test of the current build against localhost:3000.
// Uses Chrome CDP and real DEV test accounts. Verifies key routes render
// without console errors or horizontal overflow at desktop, tablet and mobile.
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import WebSocket from "ws";

const ACCOUNT_FILE = ".phase2c-accounts.local.json";
const CHROME_PORT = 9233;
const BASE = "http://localhost:3000";
const TIMEOUT_MS = 20000;

function loadAccount(roleName) {
  const data = JSON.parse(readFileSync(ACCOUNT_FILE, "utf8"));
  return data[roleName];
}

async function ensureChrome() {
  try {
    if ((await fetch(`http://127.0.0.1:${CHROME_PORT}/json/version`)).ok) return;
  } catch {}
  spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
    "--headless=new",
    `--remote-debugging-port=${CHROME_PORT}`,
    "--user-data-dir=C:\\Users\\SYNERG~1\\AppData\\Local\\Temp\\sch-smoke-chrome",
    "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--disable-extensions", "--disable-background-networking",
  ], { detached: true, stdio: "ignore" });
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try { if ((await fetch(`http://127.0.0.1:${CHROME_PORT}/json/version`)).ok) return; } catch {}
  }
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
    const timer = setTimeout(() => reject(new Error(`Timeout ${method}`)), TIMEOUT_MS);
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

async function waitForText(ws, text, timeoutMs = 20000) {
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
  try { await sendCdp(ws, "Network.enable"); await sendCdp(ws, "Network.clearBrowserCookies"); } catch {}
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
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const url = (await evalJs(ws, "window.location.href")) || "";
    if (!url.includes("/login")) return url;
  }
  throw new Error(`login timeout for ${roleName}`);
}

async function setViewport(ws, width, height) {
  await sendCdp(ws, "Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 768 });
}

async function checkPage(ws, role, url, expectedText, redirectForbidden = []) {
  await sendCdp(ws, "Page.navigate", { url });
  const body = await waitForText(ws, expectedText, 25000);
  const currentUrl = (await evalJs(ws, "window.location.href")) || "";
  for (const forbidden of redirectForbidden) {
    if (currentUrl.includes(forbidden)) return { ok: false, name: `${role} ${url}`, detail: `redirected to ${currentUrl}` };
  }
  const noOverflow = await evalJs(ws, `document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1`);
  const ok = body.includes(expectedText) && noOverflow;
  return { ok, name: `${role} ${url}`, detail: ok ? "" : `missing "${expectedText}" or overflow` };
}

async function run() {
  const ws = new WebSocket(await getWsUrl());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  const consoleErrors = [];
  ws.addEventListener("message", (evt) => {
    try {
      const msg = JSON.parse(evt.data);
      if (msg.method === "Log.entryAdded" && msg.params?.entry?.level === "error") {
        const t = msg.params.entry.text || "";
        if (!/favicon|404 \(Not Found\)/i.test(t)) consoleErrors.push(t);
      }
      if (msg.method === "Runtime.exceptionThrown") consoleErrors.push(msg.params?.exceptionDetails?.text || "exception");
    } catch {}
  });
  try { await sendCdp(ws, "Log.enable"); await sendCdp(ws, "Runtime.enable"); } catch {}

  const results = [];
  const add = (r) => { results.push(r); console.log(`${r.ok ? "[PASS]" : "[FAIL]"} ${r.name}${r.detail ? " — " + r.detail : ""}`); };

  const adminPages = [
    ["/admin", "Dashboard"],
    ["/admin/clients", "Clients"],
    ["/admin/projects", "Projects"],
    ["/admin/leads", "Leads"],
    ["/admin/finances", "Finance"],
    ["/admin/systems", "Systems"],
    ["/admin/agreements", "Agreements"],
    ["/admin/operations", "Operations"],
    ["/admin/services", "Services"],
    ["/admin/staff", "Staff"],
  ];
  const financePages = [
    ["/admin/finances", "Finance"],
    ["/admin/clients", "Clients"],
    ["/admin/projects", "Projects"],
  ];
  const staffPages = [
    ["/admin/clients", "Clients"],
    ["/admin/projects", "Projects"],
    ["/admin/operations", "Operations"],
    ["/admin/services", "Services"],
  ];
  const clientPages = [
    ["/client", "Client"],
    ["/client/projects", "Projects"],
    ["/client/invoices", "Invoices"],
    ["/client/bookings", "Bookings"],
  ];

  const viewports = [[1280, 900, "desktop"], [768, 1024, "tablet"], [390, 844, "mobile"]];

  // Login page render
  await setViewport(ws, 1280, 900);
  await sendCdp(ws, "Page.navigate", { url: `${BASE}/login` });
  add({ ok: (await waitForText(ws, "Sign in")).includes("Sign in"), name: "login page renders", detail: "" });

  // Admin smoke
  await loginAs(ws, "admin");
  for (const [vpW, vpH, label] of viewports) {
    await setViewport(ws, vpW, vpH);
    for (const [path, text] of adminPages) add(await checkPage(ws, `admin (${label})`, `${BASE}${path}`, text));
  }

  // Finance smoke
  await loginAs(ws, "finance");
  for (const [vpW, vpH, label] of viewports) {
    await setViewport(ws, vpW, vpH);
    for (const [path, text] of financePages) add(await checkPage(ws, `finance (${label})`, `${BASE}${path}`, text));
  }

  // Staff smoke
  await loginAs(ws, "staff");
  for (const [vpW, vpH, label] of viewports) {
    await setViewport(ws, vpW, vpH);
    for (const [path, text] of staffPages) add(await checkPage(ws, `staff (${label})`, `${BASE}${path}`, text));
  }

  // Client smoke
  await loginAs(ws, "clientA");
  for (const [vpW, vpH, label] of viewports) {
    await setViewport(ws, vpW, vpH);
    for (const [path, text] of clientPages) add(await checkPage(ws, `client (${label})`, `${BASE}${path}`, text));
  }

  // No console errors
  add({ ok: consoleErrors.length === 0, name: "no console errors", detail: consoleErrors.slice(0, 3).join(" | ") });

  ws.close();
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`\nBROWSER SMOKE: ${passed} PASS, ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
