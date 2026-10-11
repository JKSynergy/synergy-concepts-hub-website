// Migration 034 UI verification — local dev server against hosted DEV only.
// Real Chrome via CDP. Disposable fixtures tagged b034ui-<ts>.
// Verifies: Delete button admin-only, confirmation dialog content + cancel,
// success toast + row removal, linked-project error toast, staff/finance denial
// paths already proven at DB level. No production anything.

import { readFileSync, existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { startDevServer } from "./phase2c-dev-server.mjs";
import { openPgConnection } from "./apply-migration-013.mjs";

const CHROME_PORT = 9232;
const BASE = "http://localhost:3000";
const TAG = `b034ui-${Date.now().toString(36)}`;
const ACCOUNTS = JSON.parse(readFileSync(".phase2c-accounts.local.json", "utf8"));

function loadEnv() {
  const env = {};
  readFileSync(".env.phase2c", "utf8").split("\n").forEach((l) => {
    const m = l.match(/^\s*([^#][^=]*)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  });
  env.PHASE2C_DEV_PROJECT_REF = "outuocpsotiozkpyksex";
  env.PHASE2C_CONFIRM_DEV_WRITES = "outuocpsotiozkpyksex";
  return env;
}

async function ensureChrome() {
  try { if ((await fetch(`http://127.0.0.1:${CHROME_PORT}/json/version`)).ok) return; } catch {}
  spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
    "--headless=new", `--remote-debugging-port=${CHROME_PORT}`,
    "--user-data-dir=C:\\Users\\SYNERGY CREATIVE HUB\\.gemini\\antigravity-ide\\brain\\5b20a811-854c-455a-a6f2-94875e96a286\\scratch\\chrome-test-profile-034",
    "--disable-gpu", "--no-first-run", "--no-default-browser-check", `${BASE}/login`,
  ], { detached: true, stdio: "ignore" });
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try { if ((await fetch(`http://127.0.0.1:${CHROME_PORT}/json/version`)).ok) return; } catch {}
  }
  throw new Error("Chrome did not start");
}

let ws, mid = 0;
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++mid;
  const t = setTimeout(() => reject(new Error(`Timeout ${method}`)), 30000);
  const h = (evt) => {
    try {
      const m = JSON.parse(evt.data);
      if (m.id === id) { clearTimeout(t); ws.removeEventListener("message", h); m.error ? reject(new Error(m.error.message)) : resolve(m.result); }
    } catch {}
  };
  ws.addEventListener("message", h);
  ws.send(JSON.stringify({ id, method, params }));
});
const evalJs = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }))?.result?.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loginAs(role) {
  const acc = ACCOUNTS[role];
  try { await send("Network.enable"); await send("Network.clearBrowserCookies"); } catch {}
  await send("Page.navigate", { url: `${BASE}/login` });
  // Wait for hydration: poll until the submit button has React props attached.
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    const ready = await evalJs(`(() => { const b = document.querySelector('button[type="submit"]'); return !!b && Object.keys(b).some(k => k.startsWith('__react')); })()`);
    if (ready) break;
  }
  await sleep(1500);
  await evalJs(`(() => {
    const e = document.querySelector('input[type="email"]');
    const p = document.querySelector('input[type="password"]');
    const b = document.querySelector('button[type="submit"]');
    const set = (el, v) => { const s = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value').set; s.call(el, v); el.dispatchEvent(new Event('input',{bubbles:true})); };
    set(e, ${JSON.stringify(acc.email)}); set(p, ${JSON.stringify(acc.password)}); b.click(); return true;
  })()`);
  let url = "";
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    url = (await evalJs("window.location.href")) || "";
    if (!url.includes("/login")) break;
  }
  return url;
}

async function gotoBookings(filter = "all") {
  await send("Page.navigate", { url: `${BASE}/admin/bookings` });
  for (let i = 0; i < 90; i++) {
    await sleep(500);
    const done = await evalJs(`document.querySelector('.ux-page')?.innerText?.includes('Booking requests')`);
    if (done) break;
  }
  await sleep(1000);
  if (filter !== "open") {
    await evalJs(`(() => {
      const sel = document.querySelector('select[aria-label="Filter by status"]');
      const s = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(sel),'value').set;
      s.call(sel, '${filter}'); sel.dispatchEvent(new Event('change',{bubbles:true})); return true;
    })()`);
    await sleep(800);
  }
}

const rowJs = (title) => `(() => {
  const tr = [...document.querySelectorAll('tbody tr')].find(r => r.innerText.includes(${JSON.stringify(title)}));
  return tr ? tr.innerText.slice(0, 80) : null;
})()`;
const clickRowButton = (title, label) => `(() => {
  const tr = [...document.querySelectorAll('tbody tr')].find(r => r.innerText.includes(${JSON.stringify(title)}));
  if (!tr) return 'no-row';
  const btn = [...tr.querySelectorAll('button')].find(b => b.innerText.trim() === ${JSON.stringify(label)});
  if (!btn) return 'no-button';
  btn.click(); return 'clicked';
})()`;

async function waitDialogGoneOr(pred, tries = 60) {
  for (let i = 0; i < tries; i++) {
    const v = await evalJs(pred);
    if (v) return v;
    await sleep(400);
  }
  return await evalJs(pred);
}

const results = [];
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "[PASS]" : "[FAIL]"} ${name}${extra ? " — " + extra : ""}`);
  results.push({ name, passed: !!cond });
};

async function main() {
  const env = loadEnv();
  console.log("Starting dev server against hosted DEV…");
  const child = await startDevServer({ env });

  const pg = await openPgConnection(env.PHASE2C_DB_URL);
  const clientId = (await pg.query(`SELECT id FROM public.profiles WHERE email='phase2c.clienta@example.test'`)).rows[0].id;
  const bPending = (await pg.query(
    `INSERT INTO public.bookings (client_id,type,title,status,scheduled_at,metadata)
     VALUES ($1,'consultation',$2,'pending', now() + interval '4 days', $3::jsonb) RETURNING id`,
    [clientId, `${TAG} deletable`, JSON.stringify({ tag: TAG })])).rows[0].id;
  const bLinked = (await pg.query(
    `INSERT INTO public.bookings (client_id,type,title,status,metadata)
     VALUES ($1,'custom_request',$2,'completed', $3::jsonb) RETURNING id`,
    [clientId, `${TAG} linked`, JSON.stringify({ tag: TAG })])).rows[0].id;
  await pg.query(`INSERT INTO public.projects (client_id,booking_id,title,status) VALUES ($1,$2,$3,'lead')`,
    [clientId, bLinked, `${TAG} linked project`]);

  try {
    await ensureChrome();
    const pages = await (await fetch(`http://127.0.0.1:${CHROME_PORT}/json/list`)).json();
    ws = new WebSocket(pages.find((p) => p.type === "page").webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    // ── ADMIN ──
    const landing = await loginAs("admin");
    check("admin login", !landing.includes("/login"), landing);
    await gotoBookings("all");

    const hasDelete = await evalJs(`(() => {
      const tr = [...document.querySelectorAll('tbody tr')].find(r => r.innerText.includes('${TAG} deletable'));
      return tr ? [...tr.querySelectorAll('button')].some(b => b.innerText.trim()==='Delete') : null;
    })()`);
    check("admin row has Delete", hasDelete === true);

    await evalJs(clickRowButton(`${TAG} deletable`, "Delete"));
    await sleep(600);
    const dlg = await evalJs(`document.querySelector('#ux-confirm-title')?.innerText ?? null`);
    const dlgBody = await evalJs(`document.querySelector('#ux-confirm-title')?.closest('div')?.parentElement?.querySelector('.ux-desc')?.innerText ?? document.querySelector('#ux-confirm-title')?.parentElement?.querySelector('.ux-desc')?.innerText ?? ''`);
    check("dialog title", dlg === "Delete this booking request?", dlg);
    check("dialog identifies request + requester + date",
      dlgBody.includes(`${TAG} deletable`) && /from\s/i.test(dlgBody) && /scheduled/i.test(dlgBody), dlgBody.slice(0, 160));

    // Cancel path
    await evalJs(`(() => { const b=[...document.querySelectorAll('.ux-dialog-actions button')].find(x=>x.innerText.trim()==='Cancel'); b&&b.click(); return true; })()`);
    await sleep(800);
    check("dialog cancel: row still present", (await evalJs(rowJs(`${TAG} deletable`))) !== null);
    check("dialog cancel: dialog closed", (await evalJs(`document.querySelector('#ux-confirm-title')`)) === null);

    // Confirm path
    await evalJs(clickRowButton(`${TAG} deletable`, "Delete"));
    await sleep(600);
    await evalJs(`(() => { const b=[...document.querySelectorAll('.ux-dialog-actions button')].find(x=>x.innerText.trim()==='Delete request'); b&&b.click(); return true; })()`);
    const gone = await waitDialogGoneOr(`![...document.querySelectorAll('tbody tr')].some(r => r.innerText.includes('${TAG} deletable'))`);
    check("delete confirmed: row removed from list", gone === true);
    const toast = await evalJs(`document.body.innerText`);
    check("success feedback shown", /Booking request deleted\./i.test(toast));

    // Linked-project error path
    await evalJs(clickRowButton(`${TAG} linked`, "Delete"));
    await sleep(600);
    await evalJs(`(() => { const b=[...document.querySelectorAll('.ux-dialog-actions button')].find(x=>x.innerText.trim()==='Delete request'); b&&b.click(); return true; })()`);
    const toastText = await waitDialogGoneOr(`(document.querySelector('.ux-toasts')?.innerText ?? '')`, 60);
    check("linked booking: row still present", (await evalJs(rowJs(`${TAG} linked`))) !== null);
    check("linked booking: error feedback mentions linked project", /linked to/i.test(toastText ?? ""), (toastText ?? "").slice(0, 160));

    // ── STAFF ──
    const staffLanding = await loginAs("staff");
    check("staff login", !staffLanding.includes("/login"), staffLanding);
    await gotoBookings("all");
    const staffDelete = await evalJs(`(() => {
      const rows = [...document.querySelectorAll('tbody tr')];
      return rows.some(r => [...r.querySelectorAll('button')].some(b => b.innerText.trim()==='Delete'));
    })()`);
    check("staff: no Delete buttons anywhere", staffDelete === false);
  } finally {
    await pg.query(`DELETE FROM public.bookings WHERE metadata->>'tag' LIKE 'b034ui-%'`);
    await pg.query(`DELETE FROM public.projects WHERE title LIKE 'b034ui-%'`);
    await pg.end();
    if (child && !child.killed && child.exitCode === null) {
      if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      else child.kill("SIGTERM");
    }
  }

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length}/${results.length} UI checks passed.`);
  if (failed.length) { for (const f of failed) console.log(`  FAIL: ${f.name}`); process.exitCode = 1; }
}

main().catch((e) => { console.error("UI verification failed:", e); process.exit(1); });
