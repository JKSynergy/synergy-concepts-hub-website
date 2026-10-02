import { readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";

const ACCOUNT_FILE = "E:\\SYSTEMS AND WEBSITES\\SCH_Website_Upload\\portal\\.phase2c-accounts.local.json";
const CHROME_PORT = 9223;

function loadAccount(roleName) {
  if (!existsSync(ACCOUNT_FILE)) throw new Error("Accounts file not found");
  const data = JSON.parse(readFileSync(ACCOUNT_FILE, "utf8"));
  const key = Object.keys(data).find(k => k.toLowerCase() === roleName.toLowerCase());
  if (!key) throw new Error(`Role ${roleName} not found in accounts file`);
  return data[key];
}

async function ensureChrome() {
  try {
    const res = await fetch(`http://127.0.0.1:${CHROME_PORT}/json/version`);
    if (res.ok) return;
  } catch {}

  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const profileDir = "C:\\Users\\SYNERGY CREATIVE HUB\\.gemini\\antigravity-ide\\brain\\5b20a811-854c-455a-a6f2-94875e96a286\\scratch\\chrome-test-profile";
  spawn(chromePath, [
    "--headless=new",
    `--remote-debugging-port=${CHROME_PORT}`,
    `--user-data-dir=${profileDir}`,
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "http://localhost:3000/login"
  ], { detached: true, stdio: "ignore" });

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const res = await fetch(`http://127.0.0.1:${CHROME_PORT}/json/version`);
      if (res.ok) return;
    } catch {}
  }
  throw new Error("Could not start Chrome on port " + CHROME_PORT);
}

async function getWsUrl() {
  await ensureChrome();
  const res = await fetch(`http://127.0.0.1:${CHROME_PORT}/json/list`);
  const list = await res.json();
  let page = list.find(p => p.type === "page" && p.url.includes("localhost:3000"));
  if (!page) {
    page = list.find(p => p.type === "page");
  }
  if (!page) {
    const r = await fetch(`http://127.0.0.1:${CHROME_PORT}/json/new?http://localhost:3000/login`, { method: "PUT" });
    return (await r.json()).webSocketDebuggerUrl;
  }
  return page.webSocketDebuggerUrl;
}

async function sendCdp(ws, method, params = {}) {
  const id = Math.floor(Math.random() * 1000000);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout on ${method}`)), 15000);
    const handler = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.id === id) {
          clearTimeout(timer);
          ws.removeEventListener("message", handler);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      } catch (err) {
        // ignore parse error
      }
    };
    ws.addEventListener("message", handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evalJs(ws, expression) {
  const res = await sendCdp(ws, "Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return res?.result?.value;
}

async function clickSelector(ws, selector) {
  return evalJs(ws, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    el.click();
    return true;
  })()`);
}

async function setFieldValue(ws, selector, value) {
  return evalJs(ws, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype
      : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, ${JSON.stringify(value)});
    else el.value = ${JSON.stringify(value)};
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
}

async function selectOptionContaining(ws, selector, needle) {
  return evalJs(ws, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return { ok: false, error: 'select not found' };
    const opt = Array.from(el.options).find(o => o.textContent.includes(${JSON.stringify(needle)}));
    if (!opt) return { ok: false, error: 'option not found', options: Array.from(el.options).map(o => o.textContent) };
    el.value = opt.value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, value: opt.value, label: opt.textContent };
  })()`);
}

async function selectOptionAtIndex(ws, selector, index) {
  return evalJs(ws, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return { ok: false, error: 'select not found' };
    const opts = Array.from(el.options).filter(o => o.value !== '');
    const opt = opts[${index}] || opts[0];
    if (!opt) return { ok: false, error: 'no options', options: Array.from(el.options).map(o => o.textContent) };
    el.value = opt.value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, value: opt.value, label: opt.textContent };
  })()`);
}

// Clicks a button and waits for a dialog anchor; retries to tolerate
// first-load hydration gaps where the SSR button exists before React binds handlers.
async function openDialogAndWait(ws, buttonSelector, dialogSelector, attempts = 4) {
  for (let i = 0; i < attempts; i++) {
    await clickSelector(ws, buttonSelector);
    const open = await waitForSelector(ws, dialogSelector, 6000);
    if (open) return true;
    await new Promise(r => setTimeout(r, 800));
  }
  return false;
}

// Waits for a selector to exist (post-refresh DOM) and clicks it.
async function clickWhenPresent(ws, selector, timeoutMs = 20000) {
  const found = await waitForSelector(ws, selector, timeoutMs);
  if (!found) return false;
  return (await clickSelector(ws, selector)) === true;
}

async function waitForAttr(ws, selector, attr, expected, timeoutMs = 25000) {
  const start = Date.now();
  let last = "";
  while (Date.now() - start < timeoutMs) {
    last = await evalJs(ws, `document.querySelector(${JSON.stringify(selector)})?.getAttribute(${JSON.stringify(attr)}) || ''`);
    if (last === expected) return last;
    await new Promise(r => setTimeout(r, 600));
  }
  return last;
}

async function loginAs(ws, roleName) {
  const acc = loadAccount(roleName);
  try {
    await sendCdp(ws, "Network.enable");
    await sendCdp(ws, "Network.clearBrowserCookies");
  } catch (err) {
    try {
      await sendCdp(ws, "Storage.clearDataForOrigin", { origin: "http://localhost:3000", storageTypes: "cookies" });
    } catch {}
  }
  await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/login" });
  await new Promise(r => setTimeout(r, 2500));

  const script = `
    (() => {
      const emailInput = document.querySelector('input[type="email"]');
      const passInput = document.querySelector('input[type="password"]');
      const submitBtn = document.querySelector('button[type="submit"]');
      const form = document.querySelector('form');

      if (!emailInput || !passInput) return { ok: false, error: "Form inputs not found" };

      const setNativeValue = (element, value) => {
        const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
        const prototype = Object.getPrototypeOf(element);
        const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
        if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
          prototypeValueSetter.call(element, value);
        } else if (valueSetter) {
          valueSetter.call(element, value);
        } else {
          element.value = value;
        }
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      };

      setNativeValue(emailInput, ${JSON.stringify(acc.email)});
      setNativeValue(passInput, ${JSON.stringify(acc.password)});

      if (submitBtn) {
        submitBtn.click();
      } else if (form) {
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
      return { ok: true };
    })()
  `;

  await sendCdp(ws, "Runtime.evaluate", {
    expression: script,
    returnByValue: true,
    awaitPromise: true,
  });

  let currentUrl = "";
  for (let i = 0; i < 90; i++) {
    await new Promise(r => setTimeout(r, 500));
    currentUrl = (await evalJs(ws, "window.location.href")) || "";
    if (!currentUrl.includes("/login")) {
      break;
    }
  }

  // One retry: on a cold dev server the first submit can race page compilation.
  if (currentUrl.includes("/login")) {
    await sendCdp(ws, "Runtime.evaluate", { expression: script, returnByValue: true, awaitPromise: true });
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 500));
      currentUrl = (await evalJs(ws, "window.location.href")) || "";
      if (!currentUrl.includes("/login")) break;
    }
  }

  return currentUrl;
}

async function waitForText(ws, text, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const body = (await evalJs(ws, "document.body.innerText")) || "";
    if (body.includes(text)) return body;
    await new Promise(r => setTimeout(r, 400));
  }
  return (await evalJs(ws, "document.body.innerText")) || "";
}

async function waitForSelector(ws, selector, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = await evalJs(ws, `!!document.querySelector(${JSON.stringify(selector)})`);
    if (found === true) return true;
    await new Promise(r => setTimeout(r, 400));
  }
  return false;
}

async function setViewport(ws, width, height) {
  await sendCdp(ws, "Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
}

async function runBrowserVerification() {
  console.log(`Connecting to Chrome remote debugger on http://127.0.0.1:${CHROME_PORT} ...`);
  const wsUrl = await getWsUrl();
  const ws = new WebSocket(wsUrl);

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  console.log("Connected to Chrome via CDP successfully.\n");
  const results = [];

  function check(name, condition, extra = "") {
    if (condition) {
      console.log(`[PASS] ${name}${extra ? ` — ${extra}` : ""}`);
      results.push({ name, passed: true });
    } else {
      console.error(`[FAIL] ${name}${extra ? ` — ${extra}` : ""}`);
      results.push({ name, passed: false, error: extra });
    }
  }

  const clientAcc = loadAccount("clientA");
  const clientLabel = clientAcc.email; // client options render email when no company_name

  try {
    // -----------------------------------------------------------------
    // 1. ADMIN FLOW
    // -----------------------------------------------------------------
    console.log("--- 1. ADMIN ROLE VERIFICATION ---");
    const adminUrl = await loginAs(ws, "admin");
    check("Admin login successful", !adminUrl.includes("/login"), `Current URL: ${adminUrl}`);

    // Finance nav exposes the Provider Costs tab
    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/finances" });
    await new Promise(r => setTimeout(r, 2000));
    const navHasCosts = await evalJs(ws, `Array.from(document.querySelectorAll('a')).some(a => (a.textContent || '').includes('Provider Costs'))`);
    check("Provider Costs tab present under Finance navigation", navHasCosts === true);

    // Navigate to /admin/finances/provider-costs — wait for the manager (client
    // component) to stream in before probing element selectors.
    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/finances/provider-costs" });
    const costsPageText = await waitForText(ws, "Provider Costs");
    await waitForSelector(ws, "#provider-cost-list", 20000);
    check("Provider Costs page rendered for Admin", costsPageText.includes("Provider Costs"));
    check("Per-currency totals strip present (UGX and USD separate)",
      (await evalJs(ws, `!!document.querySelector('#cost-total-UGX') && !!document.querySelector('#cost-total-USD')`)) === true);
    check("Service Margin table present",
      (await evalJs(ws, `!!document.querySelector('#service-margin-table')`)) === true);
    check("New Provider Cost button present for Admin",
      (await evalJs(ws, `!!document.querySelector('#btn-create-cost')`)) === true);

    // Open "New Provider Cost" dialog
    check("Create Cost Dialog opened",
      await openDialogAndWait(ws, "#btn-create-cost", "#dialog-create-cost-title"), "labelledBy anchor");

    // Fill form: allocation=client -> client -> resource -> description/amount/currency/period/renewal
    const pickClient = await selectOptionContaining(ws, "#select-cost-client", clientLabel);
    check("Test client selectable for cost allocation", pickClient?.ok === true, pickClient?.label || JSON.stringify(pickClient));
    await new Promise(r => setTimeout(r, 800));
    const pickResource = await selectOptionAtIndex(ws, "#select-cost-resource", 0);
    check("Resource selectable for cost", pickResource?.ok === true, pickResource?.label || JSON.stringify(pickResource));

    const costDesc = `CDP Hosting Cost ${Date.now().toString().slice(-4)}`;
    await setFieldValue(ws, "#input-cost-description", costDesc);
    await setFieldValue(ws, "#input-cost-amount", "42.50");
    await setFieldValue(ws, "#select-cost-currency", "USD");
    await setFieldValue(ws, "#input-cost-period-start", "2026-10-01");
    await setFieldValue(ws, "#input-cost-period-end", "2026-10-31");
    await setFieldValue(ws, "#select-cost-status", "due");
    await clickSelector(ws, "#input-cost-recurring");
    await new Promise(r => setTimeout(r, 400));
    await setFieldValue(ws, "#input-cost-renewal-date", "2026-11-01");
    await setFieldValue(ws, "#input-cost-notes", "CDP verification cost");
    await clickSelector(ws, "#submit-create-cost");

    const costCreated = await waitForText(ws, costDesc, 20000);
    check("Provider cost created and displayed", costCreated.includes(costDesc), costDesc);

    // Detail panel: status badge + amount rendered
    const statusVal = await waitForSelector(ws, "#active-cost-status", 20000)
      ? await evalJs(ws, `document.querySelector('#active-cost-status')?.getAttribute('data-status') || ''`)
      : "";
    check("Cost status badge rendered", ["estimated", "accrued", "due", "paid", "cancelled"].includes(statusVal), `status=${statusVal}`);
    const amountText = await evalJs(ws, `document.querySelector('#active-cost-amount')?.innerText || ''`);
    check("Cost amount rendered in recorded currency", /\bUSD\b/.test(amountText || ""), `amount=${amountText}`);
    check("Edit Cost button present for Admin",
      (await evalJs(ws, `!!document.querySelector('#btn-edit-cost')`)) === true);
    check("Mark Paid control present for Admin",
      (await evalJs(ws, `!!document.querySelector('#btn-mark-cost-paid')`)) === true);

    // Renewal state derived deterministically (2026-11-01 is upcoming/due relative to now)
    const renewalState = await evalJs(ws, `(() => {
      const card = document.querySelector('[id^="cost-card-"][data-renewal-state]');
      return card ? card.getAttribute('data-renewal-state') : null;
    })()`);
    check("Renewal state derived on cost card", ["upcoming", "due", "overdue"].includes(renewalState), `state=${renewalState}`);

    // Status transition: due -> paid
    await clickWhenPresent(ws, "#btn-mark-cost-paid");
    const paidState = await waitForAttr(ws, "#active-cost-status", "data-status", "paid", 25000);
    check("Cost marked paid (status -> paid)", paidState === "paid", `status=${paidState}`);

    // Audit history rendered
    const histText = await waitForText(ws, "provider_cost.status_changed", 15000);
    check("Cost detail shows audit activity (provider_cost.status_changed logged)",
      histText.includes("Activity History") && histText.includes("provider_cost.status_changed"));

    // Cancel the cost (terminal lifecycle)
    await clickWhenPresent(ws, "#btn-cancel-cost");
    const cancelledState = await waitForAttr(ws, "#active-cost-status", "data-status", "cancelled", 25000);
    check("Cost cancelled (status -> cancelled, terminal)", cancelledState === "cancelled", `status=${cancelledState}`);

    // Filters: currency filter exists and works
    await setFieldValue(ws, "#filter-cost-currency", "USD");
    await new Promise(r => setTimeout(r, 600));
    const onlyUsd = await evalJs(ws, `Array.from(document.querySelectorAll('[id^="cost-card-"]')).every(c => c.getAttribute('data-cost-currency') === 'USD')`);
    check("Currency filter narrows list to USD only", onlyUsd === true);

    // Margin rows carry currency + state attributes (never combined)
    const marginRows = await evalJs(ws, `Array.from(document.querySelectorAll('.margin-row')).map(r => r.getAttribute('data-margin-currency'))`);
    check("Margin rows are per-currency", marginRows === null || marginRows.every(c => c === "UGX" || c === "USD"),
      marginRows ? `rows=${marginRows.length}` : "no rows");

    // Operations hub renewal card (non-financial)
    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/operations" });
    const opsText = await waitForText(ws, "Infrastructure Renewals");
    check("Operations hub surfaces Infrastructure Renewals card", opsText.includes("Infrastructure Renewals"));

    // -----------------------------------------------------------------
    // 2. FINANCE FLOW
    // -----------------------------------------------------------------
    console.log("\n--- 2. FINANCE ROLE VERIFICATION ---");
    const finUrl = await loginAs(ws, "finance");
    check("Finance login successful", !finUrl.includes("/login"), `Current URL: ${finUrl}`);

    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/finances/provider-costs" });
    await waitForText(ws, "Provider Costs");
    await waitForSelector(ws, "#provider-cost-list", 20000);
    await new Promise(r => setTimeout(r, 800));
    const finPageText = (await evalJs(ws, "document.body.innerText")) || "";
    check("Finance can view provider costs", finPageText.includes("Provider Costs"));
    check("Finance sees cost amounts and currency", /\b(UGX|USD)\b/.test(finPageText));
    check("Finance sees Service Margin table",
      (await evalJs(ws, `!!document.querySelector('#service-margin-table')`)) === true);
    check("Finance sees renewal information", finPageText.includes("Renewals") || (await evalJs(ws, `!!document.querySelector('#renewal-count-upcoming')`)) === true);
    check("Finance has cost management control (New Provider Cost)",
      (await evalJs(ws, `!!document.querySelector('#btn-create-cost')`)) === true);
    check("Finance sees no operational execution controls (no backup/task controls)",
      (await evalJs(ws, `!document.querySelector('#btn-record-event') && !document.querySelector('#btn-create-policy')`)) === true);
    check("Finance filters present (client/type/status/currency)",
      (await evalJs(ws, `!!document.querySelector('#filter-cost-client') && !!document.querySelector('#filter-cost-type') && !!document.querySelector('#filter-cost-status') && !!document.querySelector('#filter-cost-currency')`)) === true);

    // -----------------------------------------------------------------
    // 3. STAFF FLOW — financial anti-leak
    // -----------------------------------------------------------------
    console.log("\n--- 3. STAFF ROLE VERIFICATION (anti-leak) ---");
    const staffUrl = await loginAs(ws, "staff");
    check("Staff login successful", !staffUrl.includes("/login"), `Current URL: ${staffUrl}`);

    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/finances/provider-costs" });
    await new Promise(r => setTimeout(r, 2500));
    const staffNavRes = await evalJs(ws, "window.location.pathname");
    check("Staff denied access to provider costs route (redirected)", staffNavRes !== "/admin/finances/provider-costs", `Path: ${staffNavRes}`);

    // Staff sees renewal timing on the Operations hub — but no amounts/currency
    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/operations" });
    const staffOpsText = await waitForText(ws, "Infrastructure Renewals");
    check("Staff sees Infrastructure Renewals card on Operations hub", staffOpsText.includes("Infrastructure Renewals"));
    check("Staff renewal card contains NO currency figures",
      !/UGX\s*[\d,]/i.test(staffOpsText) && !/USD\s*[\d,]/i.test(staffOpsText),
      "no 'UGX 123'/'USD 123' patterns");
    check("Staff sees no provider-cost management controls",
      (await evalJs(ws, `!document.querySelector('#btn-create-cost') && !document.querySelector('#btn-edit-cost') && !document.querySelector('#service-margin-table')`)) === true);

    // -----------------------------------------------------------------
    // 4. CLIENT ROLE ISOLATION VERIFICATION
    // -----------------------------------------------------------------
    console.log("\n--- 4. CLIENT ROLE ISOLATION VERIFICATION ---");
    const clientUrl = await loginAs(ws, "clientA");
    check("Client login successful", !clientUrl.includes("/login"), `Current URL: ${clientUrl}`);

    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/finances/provider-costs" });
    await new Promise(r => setTimeout(r, 2500));
    const clientNavRes = await evalJs(ws, "window.location.pathname");
    check("Client denied access to provider costs (redirected)", clientNavRes === "/client", `Path: ${clientNavRes}`);

    // -----------------------------------------------------------------
    // 5. OPERATIONS REGRESSION (Tasks, Incidents, Suspensions, Backups, Payments)
    // -----------------------------------------------------------------
    console.log("\n--- 5. PHASE 3C/3D/3E + FINANCE REGRESSION ---");
    await loginAs(ws, "admin");

    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/operations/tasks" });
    const tasksPageText = await waitForText(ws, "Operational Tasks");
    check("Tasks page (Phase 3D) remains intact", tasksPageText.includes("Operational Tasks"));

    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/operations/incidents" });
    const incsPageText = await waitForText(ws, "Operational Incidents");
    check("Incidents page (Phase 3D) remains intact", incsPageText.includes("Operational Incidents"));

    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/operations/suspensions" });
    const suspPageText = await waitForText(ws, "Suspension & Service Enforcement");
    check("Suspensions page (Phase 3C) remains intact",
      suspPageText.includes("Suspension & Service Enforcement"));

    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/operations/backups" });
    const backupsPageText = await waitForText(ws, "Backup Governance");
    check("Backups page (Phase 3E) remains intact", backupsPageText.includes("Backup Governance"));

    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/finances" });
    const payPageText = await waitForText(ws, "Payments");
    check("Payments page (Finance) remains intact", payPageText.includes("Payments"));

    // -----------------------------------------------------------------
    // 6. RESPONSIVE DESIGN & NO OVERFLOW
    // -----------------------------------------------------------------
    console.log("\n--- 6. RESPONSIVE VIEWPORT CHECKS ---");
    const viewports = [
      { name: "Desktop 1280x800", width: 1280, height: 800 },
      { name: "Tablet 768x1024", width: 768, height: 1024 },
      { name: "Mobile 375x812", width: 375, height: 812 },
    ];

    for (const vp of viewports) {
      await setViewport(ws, vp.width, vp.height);
      await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/finances/provider-costs" });
      await new Promise(r => setTimeout(r, 1500));

      const overflowRes = await evalJs(ws, "document.documentElement.scrollWidth <= window.innerWidth");
      check(`Zero horizontal overflow on ${vp.name}`, overflowRes === true, `Width: ${vp.width}px`);
    }

    // Mobile nav check
    const menuVisible = await evalJs(ws, `(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Menu');
      return !!btn;
    })()`);
    check("Mobile navigation menu control present at 375px", menuVisible === true);

  } finally {
    await setViewport(ws, 1280, 800);
    ws.close();
  }

  console.log("\n==================================================");
  const passCount = results.filter(r => r.passed).length;
  const failCount = results.filter(r => !r.passed).length;
  console.log(`PHASE 3F BROWSER VERIFICATION: ${passCount} PASS, ${failCount} FAIL`);
  console.log("==================================================");

  if (failCount > 0) {
    throw new Error(`Browser verification failed with ${failCount} failures.`);
  }

  return { passCount, failCount, results };
}

runBrowserVerification()
  .then(() => {
    console.log("Phase 3F Browser Verification complete.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Phase 3F Browser Verification FAILED:", err);
    process.exit(1);
  });
