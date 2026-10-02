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
  await new Promise(r => setTimeout(r, 2000));

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
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    const urlRes = await sendCdp(ws, "Runtime.evaluate", {
      expression: "window.location.href",
      returnByValue: true,
    });
    currentUrl = urlRes?.result?.value || "";
    if (!currentUrl.includes("/login")) {
      break;
    }
  }

  return currentUrl;
}

async function waitForText(ws, text, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await sendCdp(ws, "Runtime.evaluate", {
      expression: "document.body.innerText",
      returnByValue: true,
    });
    const body = res?.result?.value || "";
    if (body.includes(text)) return body;
    await new Promise(r => setTimeout(r, 400));
  }
  const res = await sendCdp(ws, "Runtime.evaluate", {
    expression: "document.body.innerText",
    returnByValue: true,
  });
  return res?.result?.value || "";
}

async function waitForSelector(ws, selector, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await sendCdp(ws, "Runtime.evaluate", {
      expression: `!!document.querySelector('${selector}')`,
      returnByValue: true,
    });
    if (res?.result?.value === true) return true;
    await new Promise(r => setTimeout(r, 400));
  }
  return false;
}

async function waitForCaseStatus(ws, expectedStatus, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await sendCdp(ws, "Runtime.evaluate", {
      expression: `document.querySelector('#active-case-status')?.getAttribute('data-status')`,
      returnByValue: true,
    });
    if (res?.result?.value === expectedStatus) return true;
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

  try {
    // -----------------------------------------------------------------
    // 1. ADMIN VERIFICATION
    // -----------------------------------------------------------------
    console.log("--- 1. ADMIN ROLE VERIFICATION ---");
    const adminUrl = await loginAs(ws, "admin");
    check("Admin login successful", !adminUrl.includes("/login"), `Current URL: ${adminUrl}`);

    // Navigate to /admin/operations
    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/operations" });
    const opsPageText = await waitForText(ws, "Operations & Service Enforcement");
    check("Operations landing page rendered", opsPageText.includes("Operations & Service Enforcement"), "Landing confirmed");
    check("Suspension & Enforcement link present in Operations", opsPageText.includes("Suspension & Service Enforcement"));

    // Navigate to /admin/operations/suspensions
    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/operations/suspensions" });
    const adminPageText = await waitForText(ws, "Suspension & Service Enforcement");
    check("Suspension page rendered for Admin", adminPageText.includes("Suspension & Service Enforcement"), "Header confirmed");
    check("Raise Suspension Case button present for Admin", adminPageText.includes("Raise Suspension Case"));

    // Click "Raise Suspension Case" to open modal
    const clickNewCase = await sendCdp(ws, "Runtime.evaluate", {
      expression: `
        (() => {
          const btn = document.querySelector('#btn-create-case');
          if (btn) { btn.click(); return true; }
          return false;
        })()
      `,
      returnByValue: true,
    });
    check("Open Raise Suspension Case Dialog", clickNewCase?.result?.value === true, "Clicked #btn-create-case");
    await waitForSelector(ws, '#submit-create-case', 8000);

    const testReason = "CDP Test Suspension " + Date.now();

    // Fill and submit suspension case form
    const createCaseRes = await sendCdp(ws, "Runtime.evaluate", {
      expression: `
        (() => {
          const sel = document.querySelector('#select-case-agreement');
          if (sel && sel.options.length > 1) {
            sel.selectedIndex = 1;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
          }
          const reasonInput = document.querySelector('#input-case-reason');
          const submitBtn = document.querySelector('#submit-create-case');
          if (!reasonInput || !submitBtn) return { ok: false, error: "Inputs not found" };

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

          setNativeValue(reasonInput, ${JSON.stringify(testReason)});
          submitBtn.click();
          return { ok: true };
        })()
      `,
      returnByValue: true,
    });
    check("Submit Raise Suspension Case Form", createCaseRes?.result?.value?.ok === true);
    await new Promise(r => setTimeout(r, 2000));

    // Check newly created case is in proposed / pending_approval
    const caseListText = await waitForText(ws, testReason, 8000);
    check("New case appears in list", caseListText.includes(testReason));

    // Select the new case card to make it active in the detail pane
    await sendCdp(ws, "Runtime.evaluate", {
      expression: `
        (() => {
          const items = Array.from(document.querySelectorAll('div[id^="case-card-"]'));
          const target = items.find(el => el.innerText.includes(${JSON.stringify(testReason)}));
          if (target) { target.click(); return true; }
          return false;
        })()
      `,
      returnByValue: true,
    });
    await new Promise(r => setTimeout(r, 1000));

    // Check Admin approval controls visible
    const hasApproveBtn = await waitForSelector(ws, '#btn-approve-case', 12000);
    check("Admin has Approve Case button", hasApproveBtn);

    // Approve the case
    await sendCdp(ws, "Runtime.evaluate", {
      expression: "document.querySelector('#btn-approve-case')?.click()",
      returnByValue: true,
    });

    // Check case transitioned to approved
    const isApproved = await waitForCaseStatus(ws, "approved", 15000);
    check("Case transitioned to approved status", isApproved);

    // Execute suspension
    const hasExecBtn = await waitForSelector(ws, '#btn-execute-suspension', 12000);
    check("Admin/Assignee has Execute Suspension button", hasExecBtn);

    await sendCdp(ws, "Runtime.evaluate", {
      expression: "document.querySelector('#btn-execute-suspension')?.click()",
      returnByValue: true,
    });

    // Check case is now suspended
    const isSuspended = await waitForCaseStatus(ws, "suspended", 15000);
    check("Case status is suspended", isSuspended);

    // Check Verify Execution button
    const hasVerifyBtn = await waitForSelector(ws, '#btn-verify-suspension', 12000);
    check("Admin has Verify Execution button", hasVerifyBtn);

    await sendCdp(ws, "Runtime.evaluate", {
      expression: "document.querySelector('#btn-verify-suspension')?.click()",
      returnByValue: true,
    });
    await new Promise(r => setTimeout(r, 2000));

    // Restoration flow: Initiate Restoration
    const hasInitRestBtn = await waitForSelector(ws, '#btn-initiate-restoration', 15000);
    check("Initiate Restoration button present", hasInitRestBtn);

    await sendCdp(ws, "Runtime.evaluate", {
      expression: "document.querySelector('#btn-initiate-restoration')?.click()",
      returnByValue: true,
    });

    // Complete Restoration
    const hasCompRestBtn = await waitForSelector(ws, '#btn-complete-restoration', 15000);
    check("Mark Restored button present", hasCompRestBtn);

    await sendCdp(ws, "Runtime.evaluate", {
      expression: "document.querySelector('#btn-complete-restoration')?.click()",
      returnByValue: true,
    });

    const isRestored = await waitForCaseStatus(ws, "restored", 15000);
    check("Case reaches restored state", isRestored);

    // -----------------------------------------------------------------
    // 2. FINANCE ROLE VERIFICATION
    // -----------------------------------------------------------------
    console.log("\n--- 2. FINANCE ROLE VERIFICATION ---");
    const finUrl = await loginAs(ws, "finance");
    check("Finance login successful", !finUrl.includes("/login"), `Finance landing: ${finUrl}`);

    // Navigate to /admin/operations/suspensions
    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/operations/suspensions" });
    const finText = await waitForText(ws, "Suspension & Service Enforcement", 10000);

    check("Finance reaches /admin/operations/suspensions", finText.includes("Suspension & Service Enforcement"), "Page loaded");
    check("Finance sees read-only banner", finText.includes("Finance View (Read-Only Context)"), "Read-only context confirmed");

    // Finance MUST NOT have operational or approval controls
    const finControlsCheck = await sendCdp(ws, "Runtime.evaluate", {
      expression: `
        (() => {
          const hasCreate = !!document.querySelector('#btn-create-case');
          const hasApprove = !!document.querySelector('button[id^="btn-approve-case-"]');
          const hasReject = !!document.querySelector('button[id^="btn-reject-case-"]');
          const hasExec = !!document.querySelector('button[id^="btn-execute-suspension-"]');
          const hasVerify = !!document.querySelector('button[id^="btn-verify-suspension-"]');
          const hasActionAdd = !!document.querySelector('button[id^="btn-record-action-"]');
          return { hasCreate, hasApprove, hasReject, hasExec, hasVerify, hasActionAdd };
        })()
      `,
      returnByValue: true,
    });
    const fc = finControlsCheck?.result?.value || {};
    check("Finance cannot create suspension cases", fc.hasCreate === false);
    check("Finance cannot approve suspension cases", fc.hasApprove === false);
    check("Finance cannot execute suspension cases", fc.hasExec === false);
    check("Finance cannot verify suspension executions", fc.hasVerify === false);

    // -----------------------------------------------------------------
    // 3. STAFF ROLE VERIFICATION
    // -----------------------------------------------------------------
    console.log("\n--- 3. STAFF ROLE VERIFICATION ---");
    const staffUrl = await loginAs(ws, "staff");
    check("Staff login successful", !staffUrl.includes("/login"), `Staff landing: ${staffUrl}`);

    // Navigate to /admin/operations/suspensions
    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/operations/suspensions" });
    const staffText = await waitForText(ws, "Suspension & Service Enforcement", 10000);

    check("Staff reaches /admin/operations/suspensions", staffText.includes("Suspension & Service Enforcement"), "Page loaded");
    check("Staff sees operational context banner", staffText.includes("Staff Operational View"), "Operational banner confirmed");

    // Staff MUST NOT have approval controls
    const staffControlsCheck = await sendCdp(ws, "Runtime.evaluate", {
      expression: `
        (() => {
          const hasApprove = !!document.querySelector('button[id^="btn-approve-case-"]');
          const hasReject = !!document.querySelector('button[id^="btn-reject-case-"]');
          const hasVerify = !!document.querySelector('button[id^="btn-verify-suspension-"]');
          const text = document.body.innerText;
          const hasUgxAmount = /UGX\\s*[\\d,]{4,}/.test(text);
          const hasUsdAmount = /USD\\s*[\\d,]{2,}/.test(text);
          return { hasApprove, hasReject, hasVerify, hasUgxAmount, hasUsdAmount };
        })()
      `,
      returnByValue: true,
    });
    const sc = staffControlsCheck?.result?.value || {};
    check("Staff cannot approve suspension cases", sc.hasApprove === false);
    check("Staff cannot reject suspension cases", sc.hasReject === false);
    check("Staff cannot verify suspension executions", sc.hasVerify === false);
    check("Staff sees zero inappropriate financial amounts (Anti-leak)", !sc.hasUgxAmount && !sc.hasUsdAmount);

    // -----------------------------------------------------------------
    // 4. CLIENT ROLE VERIFICATION (ISOLATION)
    // -----------------------------------------------------------------
    console.log("\n--- 4. CLIENT ROLE VERIFICATION (ISOLATION) ---");
    const clientUrl = await loginAs(ws, "clientA");
    check("Client login successful", !clientUrl.includes("/login"), `Client landing: ${clientUrl}`);

    // Client attempts to navigate directly to /admin/operations/suspensions
    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/operations/suspensions" });
    await new Promise(r => setTimeout(r, 2000));

    const finalClientUrl = (await sendCdp(ws, "Runtime.evaluate", {
      expression: "window.location.href",
      returnByValue: true,
    }))?.result?.value || "";

    check(
      "Client denied access to /admin/operations/suspensions (Redirected)",
      !finalClientUrl.includes("/admin/operations/suspensions"),
      `Redirected to: ${finalClientUrl}`
    );

    // -----------------------------------------------------------------
    // 5. RESPONSIVE VIEWPORT CHECKS
    // -----------------------------------------------------------------
    console.log("\n--- 5. RESPONSIVE VIEWPORT CHECKS ---");
    // Log back in as admin to check the page at all 3 viewports
    await loginAs(ws, "admin");
    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/operations/suspensions" });
    await waitForText(ws, "Suspension & Service Enforcement");

    const viewports = [
      { name: "Desktop (1280x800)", width: 1280, height: 800 },
      { name: "Tablet (768x1024)", width: 768, height: 1024 },
      { name: "Mobile (375x812)", width: 375, height: 812 },
    ];

    for (const vp of viewports) {
      await setViewport(ws, vp.width, vp.height);
      await new Promise(r => setTimeout(r, 800));

      const vpCheck = await sendCdp(ws, "Runtime.evaluate", {
        expression: `
          (() => {
            const hasHScroll = document.documentElement.scrollWidth > window.innerWidth;
            return { hasHScroll };
          })()
        `,
        returnByValue: true,
      });
      const vpRes = vpCheck.result.value;
      check(`${vp.name}: No unexpected horizontal overflow`, !vpRes.hasHScroll);
    }

    // Reset viewport
    await sendCdp(ws, "Emulation.clearDeviceMetricsOverride");

    console.log("\n==================================================");
    const passCount = results.filter(r => r.passed).length;
    const failCount = results.filter(r => !r.passed).length;
    console.log(`BROWSER VERIFICATION SUMMARY: ${passCount} PASS, ${failCount} FAIL`);
    console.log("==================================================");

    if (failCount > 0) {
      process.exit(1);
    }
  } finally {
    ws.close();
  }
}

runBrowserVerification().catch((err) => {
  console.error("Browser verification failed with fatal error:", err);
  process.exit(1);
});
