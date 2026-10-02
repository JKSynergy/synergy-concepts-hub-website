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

async function waitForStatus(ws, selector, expected, timeoutMs = 25000) {
  const start = Date.now();
  let last = "";
  while (Date.now() - start < timeoutMs) {
    last = await evalJs(ws, `document.querySelector(${JSON.stringify(selector)})?.getAttribute('data-status') || ''`);
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

  const staffAcc = loadAccount("staff");

  try {
    // -----------------------------------------------------------------
    // 1. ADMIN FLOW
    // -----------------------------------------------------------------
    console.log("--- 1. ADMIN ROLE VERIFICATION ---");
    const adminUrl = await loginAs(ws, "admin");
    check("Admin login successful", !adminUrl.includes("/login"), `Current URL: ${adminUrl}`);

    // Navigate to /admin/operations
    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/operations" });
    const opsPageText = await waitForText(ws, "Operations Hub");
    check("Operations landing page rendered", opsPageText.includes("Operations Hub"), "Header confirmed");
    check("Operational Tasks section present in Hub", opsPageText.includes("Operational Tasks"));
    check("Operational Incidents section present in Hub", opsPageText.includes("Operational Incidents"));
    check("Service Enforcement section present in Hub", opsPageText.includes("Service Enforcement"));

    // Navigate to /admin/operations/tasks
    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/operations/tasks" });
    const tasksPageText = await waitForText(ws, "Operational Tasks");
    check("Tasks page rendered for Admin", tasksPageText.includes("Operational Tasks"));
    check("Create Task button present for Admin",
      (await evalJs(ws, `!!document.querySelector('#btn-create-task')`)) === true);

    // Open "Create Task" modal
    check("Create Task Dialog opened",
      await openDialogAndWait(ws, "#btn-create-task", "#dialog-create-task-title"), "labelledBy anchor");

    // Fill form and create task
    const testTaskTitle = `CDP Ops Work Order ${Date.now().toString().slice(-4)}`;
    await setFieldValue(ws, "#input-task-title", testTaskTitle);
    await setFieldValue(ws, "#select-task-priority", "urgent");
    await setFieldValue(ws, "#input-task-desc", "Automated CDP operational validation task");
    await clickSelector(ws, "#submit-create-task");

    // Wait for task to appear in list
    const taskCreated = await waitForText(ws, testTaskTitle, 20000);
    check("Task created and displayed in list", taskCreated.includes(testTaskTitle), testTaskTitle);

    // Detail panel: verify status and action buttons
    const openStatus = await waitForStatus(ws, "#active-task-status", "open", 20000);
    check("Task detail panel rendered with open status", openStatus === "open", `status=${openStatus}`);
    check("Assign Task button present for Admin",
      (await evalJs(ws, `!!document.querySelector('#btn-assign-task')`)) === true);
    check("Start Task button present",
      (await evalJs(ws, `!!document.querySelector('#btn-start-task')`)) === true);

    // Assign task to the staff test account
    check("Assign Task Dialog opened",
      await openDialogAndWait(ws, "#btn-assign-task", "#dialog-assign-task-title"));
    const pickStaff = await selectOptionContaining(ws, "#select-assign-engineer", staffAcc.email);
    check("Staff account selectable as assignee", pickStaff?.ok === true, pickStaff?.label || JSON.stringify(pickStaff));
    await clickSelector(ws, "#submit-assign-task");
    const assignedStatus = await waitForStatus(ws, "#active-task-status", "assigned", 25000);
    check("Task assigned to Staff (status -> assigned)", assignedStatus === "assigned", `status=${assignedStatus}`);

    // Start task
    await clickWhenPresent(ws, "#btn-start-task");
    const progressStatus = await waitForStatus(ws, "#active-task-status", "in_progress", 25000);
    check("Task started (status -> in_progress)", progressStatus === "in_progress", `status=${progressStatus}`);

    // Complete task
    check("Complete Task Dialog opened",
      await openDialogAndWait(ws, "#btn-complete-task", "#dialog-complete-task-title"));
    await setFieldValue(ws, "#input-complete-notes", "CDP verification: work executed and verified.");
    await clickSelector(ws, "#submit-complete-task");
    const completedStatus = await waitForStatus(ws, "#active-task-status", "completed", 25000);
    check("Task completed (status -> completed)", completedStatus === "completed", `status=${completedStatus}`);

    // Audit history rendered in the task detail (admin sees audit_logs entries)
    const taskHistory = await waitForText(ws, "task.completed", 15000);
    check("Task detail shows audit activity history (task.completed logged)",
      taskHistory.includes("Activity History") && taskHistory.includes("task.completed"));

    // Create a second task assigned to staff (left un-completed for the staff flow)
    await openDialogAndWait(ws, "#btn-create-task", "#dialog-create-task-title");
    const staffTaskTitle = `CDP Staff Task ${Date.now().toString().slice(-4)}`;
    await setFieldValue(ws, "#input-task-title", staffTaskTitle);
    await setFieldValue(ws, "#input-task-desc", "Task for staff execution verification");
    const createAssignee = await selectOptionContaining(ws, "#select-task-assignee", staffAcc.email);
    check("Staff assignable during task creation", createAssignee?.ok === true, createAssignee?.label || "");
    await clickSelector(ws, "#submit-create-task");
    await waitForText(ws, staffTaskTitle, 20000);
    const staffTaskStatus = await waitForStatus(ws, "#active-task-status", "assigned", 25000);
    check("Second task created and auto-assigned to Staff", staffTaskStatus === "assigned", `status=${staffTaskStatus}`);

    // Navigate to /admin/operations/incidents
    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/operations/incidents" });
    const incsPageText = await waitForText(ws, "Operational Incidents");
    check("Incidents page rendered for Admin", incsPageText.includes("Operational Incidents"));
    check("Report Incident button present for Admin",
      (await evalJs(ws, `!!document.querySelector('#btn-create-incident')`)) === true);

    // Open "Report Incident" modal
    check("Create Incident Dialog opened",
      await openDialogAndWait(ws, "#btn-create-incident", "#dialog-create-incident-title"), "labelledBy anchor");

    // Fill form and create incident
    const testIncTitle = `CDP Outage Incident ${Date.now().toString().slice(-4)}`;
    await setFieldValue(ws, "#input-incident-title", testIncTitle);
    await setFieldValue(ws, "#select-incident-severity", "high");
    await setFieldValue(ws, "#input-incident-desc", "Automated CDP operational validation incident description");
    await clickSelector(ws, "#submit-create-incident");

    const incCreated = await waitForText(ws, testIncTitle, 20000);
    check("Incident created and displayed in list", incCreated.includes(testIncTitle), testIncTitle);
    const incOpenStatus = await waitForStatus(ws, "#active-incident-status", "open", 20000);
    check("Incident detail rendered with open status", incOpenStatus === "open", `status=${incOpenStatus}`);

    // Assign incident to staff
    check("Assign Incident Dialog opened",
      await openDialogAndWait(ws, "#btn-assign-incident", "#dialog-assign-incident-title"));
    const pickLead = await selectOptionContaining(ws, "#select-incident-lead", staffAcc.email);
    check("Staff account selectable as incident lead", pickLead?.ok === true, pickLead?.label || "");
    await clickSelector(ws, "#submit-assign-incident");
    await new Promise(r => setTimeout(r, 2500));

    // Acknowledge
    await clickWhenPresent(ws, "#btn-ack-incident");
    const ackStatus = await waitForStatus(ws, "#active-incident-status", "acknowledged", 25000);
    check("Incident acknowledged", ackStatus === "acknowledged", `status=${ackStatus}`);

    // Investigate
    await clickWhenPresent(ws, "#btn-investigate-incident");
    const invStatus = await waitForStatus(ws, "#active-incident-status", "investigating", 25000);
    check("Incident investigating", invStatus === "investigating", `status=${invStatus}`);

    // Resolve
    check("Resolve Incident Dialog opened",
      await openDialogAndWait(ws, "#btn-resolve-incident", "#dialog-resolve-incident-title"));
    await setFieldValue(ws, "#input-resolve-notes", "CDP verification: service restored and confirmed.");
    await clickSelector(ws, "#submit-resolve-incident");
    const resStatus = await waitForStatus(ws, "#active-incident-status", "resolved", 25000);
    check("Incident resolved", resStatus === "resolved", `status=${resStatus}`);

    // Close
    check("Close Incident Dialog opened",
      await openDialogAndWait(ws, "#btn-close-incident", "#dialog-close-incident-title"));
    await clickSelector(ws, "#submit-close-incident");
    const closedStatus = await waitForStatus(ws, "#active-incident-status", "closed", 25000);
    check("Incident closed by Admin", closedStatus === "closed", `status=${closedStatus}`);

    // Audit history rendered in the incident detail
    const incHistory = await waitForText(ws, "incident.closed", 15000);
    check("Incident detail shows audit activity history (incident.closed logged)",
      incHistory.includes("Activity History") && incHistory.includes("incident.closed"));

    // -----------------------------------------------------------------
    // 2. FINANCE FLOW
    // -----------------------------------------------------------------
    console.log("\n--- 2. FINANCE ROLE VERIFICATION ---");
    const finUrl = await loginAs(ws, "finance");
    check("Finance login successful", !finUrl.includes("/login"), `Current URL: ${finUrl}`);

    // Navigate to /admin/operations
    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/operations" });
    const finOpsText = await waitForText(ws, "Operations Hub");
    check("Finance can access Operations Hub (read-only context)", finOpsText.includes("Operations Hub"));

    // Navigate to /admin/operations/tasks
    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/operations/tasks" });
    const finTasksText = await waitForText(ws, "Operational Tasks");
    check("Finance can view tasks list", finTasksText.includes("Operational Tasks"));
    check("Finance CANNOT see 'Create Task' button",
      (await evalJs(ws, `!document.querySelector('#btn-create-task')`)) === true);
    check("Finance CANNOT see task execution controls (assign/start/complete/cancel)",
      (await evalJs(ws, `!document.querySelector('#btn-assign-task') && !document.querySelector('#btn-start-task') && !document.querySelector('#btn-complete-task') && !document.querySelector('#btn-cancel-task')`)) === true);
    check("Finance tasks view shows no financial amounts",
      !finTasksText.includes("UGX") && !finTasksText.includes("Invoice #"));

    // Navigate to /admin/operations/incidents
    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/operations/incidents" });
    const finIncsText = await waitForText(ws, "Operational Incidents");
    check("Finance can view incidents list", finIncsText.includes("Operational Incidents"));
    check("Finance CANNOT see 'Report Incident' button",
      (await evalJs(ws, `!document.querySelector('#btn-create-incident')`)) === true);
    check("Finance CANNOT see incident controls (assign/acknowledge/resolve/close/cancel)",
      (await evalJs(ws, `!document.querySelector('#btn-assign-incident') && !document.querySelector('#btn-ack-incident') && !document.querySelector('#btn-resolve-incident') && !document.querySelector('#btn-close-incident') && !document.querySelector('#btn-cancel-incident')`)) === true);

    // -----------------------------------------------------------------
    // 3. STAFF FLOW
    // -----------------------------------------------------------------
    console.log("\n--- 3. STAFF ROLE VERIFICATION ---");
    const staffUrl = await loginAs(ws, "staff");
    check("Staff login successful", !staffUrl.includes("/login"), `Current URL: ${staffUrl}`);

    // Navigate to /admin/operations
    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/operations" });
    const staffOpsText = await waitForText(ws, "Operations Hub");
    check("Staff can access Operations Hub", staffOpsText.includes("Operations Hub"));

    // Navigate to /admin/operations/tasks
    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/operations/tasks" });
    const staffTasksText = await waitForText(ws, "Operational Tasks");
    check("Staff can view operational tasks", staffTasksText.includes("Operational Tasks"));
    check("Staff sees assigned task in list", staffTasksText.includes(staffTaskTitle), staffTaskTitle);
    check("Staff cannot access invoices table or financial data on page",
      !staffTasksText.includes("UGX") && !staffTasksText.includes("Invoice #"));

    // Select the staff-assigned task card
    await evalJs(ws, `(() => {
      const card = Array.from(document.querySelectorAll('[id^="task-card-"]'))
        .find(el => el.innerText.includes(${JSON.stringify(staffTaskTitle)}));
      if (card) card.click();
    })()`);
    await new Promise(r => setTimeout(r, 1200));
    check("Staff sees execution control on own assigned task (Start Task)",
      (await evalJs(ws, `!!document.querySelector('#btn-start-task')`)) === true);
    check("Staff CANNOT see Admin-only assignment control",
      (await evalJs(ws, `!document.querySelector('#btn-assign-task')`)) === true);
    check("Staff CANNOT see Admin-only cancel control",
      (await evalJs(ws, `!document.querySelector('#btn-cancel-task')`)) === true);

    // Staff starts their assigned task
    await clickWhenPresent(ws, "#btn-start-task");
    const staffStarted = await waitForStatus(ws, "#active-task-status", "in_progress", 25000);
    check("Staff can start own assigned task (status -> in_progress)", staffStarted === "in_progress", `status=${staffStarted}`);

    // Staff incidents view
    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/operations/incidents" });
    const staffIncsText = await waitForText(ws, "Operational Incidents");
    check("Staff can view operational incidents", staffIncsText.includes("Operational Incidents"));

    // -----------------------------------------------------------------
    // 4. CLIENT ROLE ISOLATION VERIFICATION
    // -----------------------------------------------------------------
    console.log("\n--- 4. CLIENT ROLE ISOLATION VERIFICATION ---");
    const clientUrl = await loginAs(ws, "clientA");
    check("Client login successful", !clientUrl.includes("/login"), `Current URL: ${clientUrl}`);

    // Attempt direct /admin/operations
    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/operations" });
    await new Promise(r => setTimeout(r, 2500));
    const clientNavRes = await evalJs(ws, "window.location.pathname");
    check("Client denied access to /admin/operations (redirected)", clientNavRes === "/client", `Path: ${clientNavRes}`);

    // Attempt direct /admin/operations/tasks
    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/operations/tasks" });
    await new Promise(r => setTimeout(r, 2500));
    const clientTaskNav = await evalJs(ws, "window.location.pathname");
    check("Client denied access to /admin/operations/tasks (redirected)", clientTaskNav === "/client", `Path: ${clientTaskNav}`);

    // Attempt direct /admin/operations/incidents
    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/operations/incidents" });
    await new Promise(r => setTimeout(r, 2500));
    const clientIncNav = await evalJs(ws, "window.location.pathname");
    check("Client denied access to /admin/operations/incidents (redirected)", clientIncNav === "/client", `Path: ${clientIncNav}`);

    // -----------------------------------------------------------------
    // 5. SUSPENSION REGRESSION (Phase 3C)
    // -----------------------------------------------------------------
    console.log("\n--- 5. SUSPENSION REGRESSION ---");
    await loginAs(ws, "admin");
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
      await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/operations" });
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
    // Reset viewport and cleanup
    await setViewport(ws, 1280, 800);
    ws.close();
  }

  // Summary
  console.log("\n==================================================");
  const passCount = results.filter(r => r.passed).length;
  const failCount = results.filter(r => !r.passed).length;
  console.log(`PHASE 3D BROWSER VERIFICATION: ${passCount} PASS, ${failCount} FAIL`);
  console.log("==================================================");

  if (failCount > 0) {
    throw new Error(`Browser verification failed with ${failCount} failures.`);
  }

  return { passCount, failCount, results };
}

runBrowserVerification()
  .then(() => {
    console.log("Phase 3D Browser Verification complete.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Phase 3D Browser Verification FAILED:", err);
    process.exit(1);
  });
