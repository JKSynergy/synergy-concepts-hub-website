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

    // Operations hub shows the Backup Governance domain
    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/operations" });
    const opsPageText = await waitForText(ws, "Operations Hub");
    check("Operations landing page rendered", opsPageText.includes("Operations Hub"), "Header confirmed");
    check("Backup Governance section present in Hub", opsPageText.includes("Backup Governance"));

    // Navigate to /admin/operations/backups
    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/operations/backups" });
    const backupsPageText = await waitForText(ws, "Backup Governance");
    check("Backups page rendered for Admin", backupsPageText.includes("Backup Governance"));
    check("New Backup Policy button present for Admin",
      (await evalJs(ws, `!!document.querySelector('#btn-create-policy')`)) === true);

    // Open "New Backup Policy" dialog
    check("Create Policy Dialog opened",
      await openDialogAndWait(ws, "#btn-create-policy", "#dialog-create-policy-title"), "labelledBy anchor");

    // Fill form: client -> resource -> name/frequency/retention
    const pickClient = await selectOptionContaining(ws, "#select-policy-client", clientLabel);
    check("Test client selectable for policy", pickClient?.ok === true, pickClient?.label || JSON.stringify(pickClient));
    await new Promise(r => setTimeout(r, 800));
    const pickResource = await selectOptionAtIndex(ws, "#select-policy-resource", 0);
    check("Resource selectable for policy", pickResource?.ok === true, pickResource?.label || JSON.stringify(pickResource));

    const policyName = `CDP Nightly Backup ${Date.now().toString().slice(-4)}`;
    await setFieldValue(ws, "#input-policy-name", policyName);
    await setFieldValue(ws, "#select-policy-frequency", "daily");
    await setFieldValue(ws, "#input-policy-retention", "30");
    await setFieldValue(ws, "#input-policy-notes", "CDP verification policy");
    await clickSelector(ws, "#submit-create-policy");

    const policyCreated = await waitForText(ws, policyName, 20000);
    check("Backup policy created and displayed", policyCreated.includes(policyName), policyName);

    // Detail panel: health badge present (new policy with no events is overdue or healthy)
    const healthVal = await waitForSelector(ws, "#active-policy-health", 20000)
      ? await evalJs(ws, `document.querySelector('#active-policy-health')?.getAttribute('data-health') || ''`)
      : "";
    check("Policy health badge rendered", ["healthy", "due", "overdue", "failed", "unverified"].includes(healthVal), `health=${healthVal}`);
    check("Record Backup Event button present",
      (await evalJs(ws, `!!document.querySelector('#btn-record-event')`)) === true);
    check("Edit Policy button present for Admin",
      (await evalJs(ws, `!!document.querySelector('#btn-edit-policy')`)) === true);

    // Record a successful backup event with evidence
    check("Record Event Dialog opened",
      await openDialogAndWait(ws, "#btn-record-event", "#dialog-record-event-title"));
    await setFieldValue(ws, "#select-event-status", "successful");
    await setFieldValue(ws, "#input-event-evidence-ref", `snapshot-${Date.now().toString().slice(-6)}`);
    await setFieldValue(ws, "#input-event-evidence-notes", "CDP verification evidence note");
    await clickSelector(ws, "#submit-record-event");

    const eventRecorded = await waitForSelector(ws, '[data-event-status="successful"]', 20000);
    check("Backup event recorded and displayed", eventRecorded === true);

    // Verify the event (latest successful event has a Verify button)
    const verifyBtn = await evalJs(ws, `(() => {
      const btn = document.querySelector('[id^="btn-verify-event-"]');
      return btn ? btn.id : null;
    })()`);
    check("Verify button present on successful event", !!verifyBtn);
    if (verifyBtn) {
      await clickWhenPresent(ws, `#${verifyBtn}`);
      const verified = await waitForSelector(ws, '[data-event-status="verified"]', 20000);
      check("Event verified (status -> verified)", verified === true);
    }

    // Policy health now reflects verified coverage
    const healthAfter = await waitForAttr(ws, "#active-policy-health", "data-health", "healthy", 25000);
    check("Policy health reports healthy after verified event", healthAfter === "healthy", `health=${healthAfter}`);

    // Record evidence on an existing event (Evidence button on verified event)
    const evBtn = await evalJs(ws, `(() => {
      const btn = document.querySelector('[id^="btn-evidence-event-"]');
      return btn ? btn.id : null;
    })()`);
    check("Evidence button present on recorded event", !!evBtn);
    if (evBtn) {
      await openDialogAndWait(ws, `#${evBtn}`, "#dialog-evidence-title");
      await setFieldValue(ws, "#input-evidence-ref", `verified-snap-${Date.now().toString().slice(-5)}`);
      await clickSelector(ws, "#submit-evidence");
      const evSaved = await waitForText(ws, "verified-snap-", 20000);
      check("Evidence recorded on event", evSaved.includes("verified-snap-"));
    }

    // Deactivate + reactivate policy (admin lifecycle control)
    await clickWhenPresent(ws, "#btn-toggle-policy");
    const deactivated = await waitForAttr(ws, "#active-policy-health", "data-health", "inactive", 25000);
    check("Policy deactivated (health -> inactive)", deactivated === "inactive", `health=${deactivated}`);
    await clickWhenPresent(ws, "#btn-toggle-policy");
    const reactivated = await waitForAttr(ws, "#active-policy-health", "data-health", "healthy", 25000);
    check("Policy reactivated (health -> healthy)", reactivated === "healthy", `health=${reactivated}`);

    // Audit history rendered in the detail panel
    const histText = await waitForText(ws, "backup_event.verified", 15000);
    check("Policy detail shows audit activity history (backup_event.verified logged)",
      histText.includes("Activity History") && histText.includes("backup_event.verified"));

    // -----------------------------------------------------------------
    // 2. STAFF FLOW
    // -----------------------------------------------------------------
    console.log("\n--- 2. STAFF ROLE VERIFICATION ---");
    const staffUrl = await loginAs(ws, "staff");
    check("Staff login successful", !staffUrl.includes("/login"), `Current URL: ${staffUrl}`);

    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/operations/backups" });
    const staffPageText = await waitForText(ws, "Backup Governance");
    check("Staff can view backup policies", staffPageText.includes("Backup Governance"));
    check("Staff CANNOT see 'New Backup Policy' control",
      (await evalJs(ws, `!document.querySelector('#btn-create-policy')`)) === true);
    check("Staff CANNOT see policy edit/deactivate controls",
      (await evalJs(ws, `!document.querySelector('#btn-edit-policy') && !document.querySelector('#btn-toggle-policy')`)) === true);
    check("Staff sees operational recording control (Record Backup Event)",
      (await evalJs(ws, `!!document.querySelector('#btn-record-event')`)) === true);
    check("Staff backups view shows no financial amounts",
      !staffPageText.includes("UGX") && !staffPageText.includes("Invoice #"));

    // Staff records a backup event
    check("Staff Record Event Dialog opened",
      await openDialogAndWait(ws, "#btn-record-event", "#dialog-record-event-title"));
    await setFieldValue(ws, "#select-event-status", "successful");
    await setFieldValue(ws, "#input-event-evidence-ref", `staff-snap-${Date.now().toString().slice(-5)}`);
    await clickSelector(ws, "#submit-record-event");
    const staffEvRecorded = await waitForText(ws, "staff-snap-", 20000);
    check("Staff can record backup event with evidence", staffEvRecorded.includes("staff-snap-"));

    // -----------------------------------------------------------------
    // 3. FINANCE FLOW
    // -----------------------------------------------------------------
    console.log("\n--- 3. FINANCE ROLE VERIFICATION ---");
    const finUrl = await loginAs(ws, "finance");
    check("Finance login successful", !finUrl.includes("/login"), `Current URL: ${finUrl}`);

    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/operations/backups" });
    const finPageText = await waitForText(ws, "Backup Governance");
    check("Finance can view backup context (read-only)", finPageText.includes("Backup Governance"));
    check("Finance CANNOT see 'New Backup Policy' control",
      (await evalJs(ws, `!document.querySelector('#btn-create-policy')`)) === true);
    check("Finance CANNOT see operational controls (record/verify/evidence/edit)",
      (await evalJs(ws, `!document.querySelector('#btn-record-event') && !document.querySelector('#btn-edit-policy') && !document.querySelector('#btn-toggle-policy') && !document.querySelector('[id^="btn-verify-event-"]') && !document.querySelector('[id^="btn-evidence-event-"]')`)) === true);
    check("Finance backups view shows no financial amounts",
      !finPageText.includes("UGX") && !finPageText.includes("Invoice #"));

    // -----------------------------------------------------------------
    // 4. CLIENT ROLE ISOLATION VERIFICATION
    // -----------------------------------------------------------------
    console.log("\n--- 4. CLIENT ROLE ISOLATION VERIFICATION ---");
    const clientUrl = await loginAs(ws, "clientA");
    check("Client login successful", !clientUrl.includes("/login"), `Current URL: ${clientUrl}`);

    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/operations/backups" });
    await new Promise(r => setTimeout(r, 2500));
    const clientNavRes = await evalJs(ws, "window.location.pathname");
    check("Client denied access to /admin/operations/backups (redirected)", clientNavRes === "/client", `Path: ${clientNavRes}`);

    // -----------------------------------------------------------------
    // 5. OPERATIONS REGRESSION (Tasks, Incidents, Suspensions)
    // -----------------------------------------------------------------
    console.log("\n--- 5. PHASE 3D/3C REGRESSION ---");
    await loginAs(ws, "admin");

    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/operations/tasks" });
    const tasksPageText = await waitForText(ws, "Operational Tasks");
    check("Tasks page (Phase 3D) remains intact", tasksPageText.includes("Operational Tasks"));

    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/operations/incidents" });
    const incsPageText = await waitForText(ws, "Operational Incidents");
    check("Incidents page (Phase 3D) remains intact", incsPageText.includes("Operational Incidents"));

    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/operations/suspensions" });
    const suspPageText = await waitForText(ws, "Suspension & Service Enforcement");
    check("Suspension pages (Phase 3C) remain intact and operational",
      suspPageText.includes("Suspension & Service Enforcement") && suspPageText.includes("Raise Suspension Case"));

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
      await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/operations/backups" });
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
  console.log(`PHASE 3E BROWSER VERIFICATION: ${passCount} PASS, ${failCount} FAIL`);
  console.log("==================================================");

  if (failCount > 0) {
    throw new Error(`Browser verification failed with ${failCount} failures.`);
  }

  return { passCount, failCount, results };
}

runBrowserVerification()
  .then(() => {
    console.log("Phase 3E Browser Verification complete.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Phase 3E Browser Verification FAILED:", err);
    process.exit(1);
  });
