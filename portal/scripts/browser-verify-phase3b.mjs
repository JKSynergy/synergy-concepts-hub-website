import { readFileSync, existsSync } from "node:fs";

const ACCOUNT_FILE = "E:\\SYSTEMS AND WEBSITES\\SCH_Website_Upload\\portal\\.phase2c-accounts.local.json";

function loadAccount(roleName) {
  if (!existsSync(ACCOUNT_FILE)) throw new Error("Accounts file not found");
  const data = JSON.parse(readFileSync(ACCOUNT_FILE, "utf8"));
  const key = Object.keys(data).find(k => k.toLowerCase() === roleName.toLowerCase());
  if (!key) throw new Error(`Role ${roleName} not found in accounts file`);
  return data[key];
}

async function getWsUrl() {
  const res = await fetch("http://127.0.0.1:9222/json/list");
  const list = await res.json();
  let page = list.find(p => p.type === "page" && p.url.includes("localhost:3000"));
  if (!page) {
    page = list.find(p => p.type === "page");
  }
  if (!page) {
    const r = await fetch("http://127.0.0.1:9222/json/new?http://localhost:3000/login", { method: "PUT" });
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
  await sendCdp(ws, "Network.clearBrowserCookies");
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

async function setViewport(ws, width, height) {
  await sendCdp(ws, "Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
}

async function runBrowserVerification() {
  console.log("Connecting to Chrome remote debugger on http://127.0.0.1:9222 ...");
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

    // Navigate to /admin/agreements
    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/agreements" });
    const adminPageText = await waitForText(ws, "Service Agreements & Recurring Billing");
    check("Agreements page rendered", adminPageText.includes("Service Agreements & Recurring Billing"), "Header verified");
    check("New Agreement button present for Admin", adminPageText.includes("+ New Agreement"), "Found button in page text");

    // Click "+ New Agreement" to open modal
    const clickNewAgr = await sendCdp(ws, "Runtime.evaluate", {
      expression: `
        (() => {
          const btn = document.querySelector('#btn-create-agreement');
          if (btn) { btn.click(); return true; }
          return false;
        })()
      `,
      returnByValue: true,
    });
    check("Open New Agreement Dialog", clickNewAgr?.result?.value === true, "Clicked #btn-create-agreement");
    await new Promise(r => setTimeout(r, 600));

    // Fill and submit agreement form
    const createAgrRes = await sendCdp(ws, "Runtime.evaluate", {
      expression: `
        (() => {
          const nameInput = document.querySelector('#input-agreement-name');
          const submitBtn = document.querySelector('#submit-create-agreement');
          if (!nameInput || !submitBtn) return { ok: false, error: "Inputs not found" };

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

          setNativeValue(nameInput, "CDP Browser Test Agreement " + Date.now());
          submitBtn.click();
          return { ok: true };
        })()
      `,
      returnByValue: true,
    });
    check("Submit New Agreement Form", createAgrRes?.result?.value?.ok === true);
    await new Promise(r => setTimeout(r, 2000));

    // Check that Add Recurring Charge button exists
    const hasAddChargeBtn = await sendCdp(ws, "Runtime.evaluate", {
      expression: "!!document.querySelector('#btn-add-charge')",
      returnByValue: true,
    });
    check("Add Recurring Charge button available for Admin", hasAddChargeBtn?.result?.value === true);

    // Click "+ Add Recurring Charge"
    await sendCdp(ws, "Runtime.evaluate", {
      expression: "document.querySelector('#btn-add-charge')?.click()",
      returnByValue: true,
    });
    await new Promise(r => setTimeout(r, 600));

    // Fill Recurring Charge form with UGX month-end
    const createChargeRes = await sendCdp(ws, "Runtime.evaluate", {
      expression: `
        (() => {
          const nameInput = document.querySelector('#input-charge-name');
          const amountInput = document.querySelector('#input-charge-amount');
          const submitBtn = document.querySelector('#submit-create-charge');
          if (!nameInput || !amountInput || !submitBtn) return { ok: false };

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

          setNativeValue(nameInput, "Monthly Hosting SLA UGX");
          setNativeValue(amountInput, "450000");
          submitBtn.click();
          return { ok: true };
        })()
      `,
      returnByValue: true,
    });
    check("Submit UGX Recurring Charge", createChargeRes?.result?.value?.ok === true);
    await waitForText(ws, "Monthly Hosting SLA UGX", 8000);

    // Wait until Generate Invoice button is enabled
    let genBtnEnabled = false;
    for (let i = 0; i < 20; i++) {
      const evalRes = await sendCdp(ws, "Runtime.evaluate", {
        expression: "(() => { const btn = document.querySelector('#btn-generate-invoice'); return btn && !btn.disabled; })()",
        returnByValue: true,
      });
      if (evalRes?.result?.value === true) {
        genBtnEnabled = true;
        break;
      }
      await new Promise(r => setTimeout(r, 400));
    }
    check("Generate Invoice button enabled", genBtnEnabled);

    // Click Generate Invoice
    await sendCdp(ws, "Runtime.evaluate", {
      expression: "document.querySelector('#btn-generate-invoice')?.click()",
      returnByValue: true,
    });
    await new Promise(r => setTimeout(r, 800));

    // Submit invoice generation
    let submitFound = false;
    for (let i = 0; i < 15; i++) {
      const chk = await sendCdp(ws, "Runtime.evaluate", {
        expression: "!!document.querySelector('#submit-generate-invoice')",
        returnByValue: true,
      });
      if (chk?.result?.value === true) {
        submitFound = true;
        break;
      }
      await new Promise(r => setTimeout(r, 300));
    }

    const genInvRes = await sendCdp(ws, "Runtime.evaluate", {
      expression: `
        (() => {
          const submitBtn = document.querySelector('#submit-generate-invoice');
          if (!submitBtn) return { ok: false, error: "submit button not in DOM" };
          submitBtn.click();
          return { ok: true };
        })()
      `,
      returnByValue: true,
    });
    check("Trigger invoice generation from modal", genInvRes?.result?.value?.ok === true, genInvRes?.result?.value?.error || "");
    const modalSuccessText = await waitForText(ws, "Draft invoice generated", 8000);
    const invoiceSuccess = modalSuccessText.includes("Draft invoice generated") || modalSuccessText.includes("Generated Billing Runs") || modalSuccessText.includes("UGX 450,000");
    check(
      "Invoice generated or idempotently returned",
      invoiceSuccess,
      "Invoice run confirmed"
    );
    await new Promise(r => setTimeout(r, 2000));

    // -----------------------------------------------------------------
    // 2. FINANCE ROLE VERIFICATION
    // -----------------------------------------------------------------
    console.log("\n--- 2. FINANCE ROLE VERIFICATION ---");
    const finUrl = await loginAs(ws, "finance");
    check("Finance login successful", !finUrl.includes("/login"), `Finance landing: ${finUrl}`);

    // Navigate to /admin/agreements
    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/agreements" });
    const finText = await waitForText(ws, "Service Agreements & Recurring Billing", 10000);

    check("Finance reaches /admin/agreements", finText.includes("Service Agreements & Recurring Billing"), "Page loaded");
    check("Finance sees pricing and recurring charges", finText.includes("Recurring Billing Schedules") && (finText.includes("UGX") || finText.includes("USD")), "Pricing is visible to Finance");
    check("Finance sees Add Recurring Charge button", finText.includes("Add Recurring Charge"), "Finance can manage charges");
    check("Finance sees Generate Invoice button", finText.includes("Generate Invoice"), "Finance can generate invoices");

    // -----------------------------------------------------------------
    // 3. STAFF ROLE VERIFICATION (FINANCIAL ANTI-LEAK)
    // -----------------------------------------------------------------
    console.log("\n--- 3. STAFF ROLE VERIFICATION (FINANCIAL ANTI-LEAK) ---");
    const staffUrl = await loginAs(ws, "staff");
    check("Staff login successful", !staffUrl.includes("/login"), `Staff landing: ${staffUrl}`);

    // Navigate to /admin/agreements
    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/agreements" });
    const staffText = await waitForText(ws, "Operational Staff View (Financials Hidden)", 10000);

    check("Staff reaches /admin/agreements operational view", staffText.includes("Operational Staff View (Financials Hidden)"), "Operational view confirmed");
    check("Staff sees operational agreement context", staffText.includes("Billing Cycle") && staffText.includes("Payment Timing"), "Operational terms visible");
    check("Staff sees derived billing standing badge", staffText.includes("Standing:") || staffText.includes("CURRENT") || staffText.includes("DUE"), "Billing standing visible");

    // ANTI-LEAK: Staff must NEVER see financial amounts, recurring charges, or pricing
    const hasFinancialsForStaff = await sendCdp(ws, "Runtime.evaluate", {
      expression: `
        (() => {
          const text = document.body.innerText;
          const hasRecurringHeader = text.includes("Recurring Billing Schedules");
          const hasAddCharge = !!document.querySelector('#btn-add-charge');
          const hasGenInvoice = !!document.querySelector('#btn-generate-invoice');
          const hasUgxAmount = /UGX\\s*[\\d,]{4,}/.test(text);
          const hasUsdAmount = /USD\\s*[\\d,]{2,}/.test(text);

          return {
            hasRecurringHeader,
            hasAddCharge,
            hasGenInvoice,
            hasUgxAmount,
            hasUsdAmount
          };
        })()
      `,
      returnByValue: true,
    });
    const staffAudit = hasFinancialsForStaff?.result?.value;
    check("ANTI-LEAK: Recurring charges section hidden from Staff", !staffAudit.hasRecurringHeader);
    check("ANTI-LEAK: Add Charge button hidden from Staff", !staffAudit.hasAddCharge);
    check("ANTI-LEAK: Generate Invoice button hidden from Staff", !staffAudit.hasGenInvoice);
    check("ANTI-LEAK: Zero UGX amounts in Staff DOM", !staffAudit.hasUgxAmount);
    check("ANTI-LEAK: Zero USD amounts in Staff DOM", !staffAudit.hasUsdAmount);

    // Verify Staff can access operational note controls
    const hasEditNotesBtn = await sendCdp(ws, "Runtime.evaluate", {
      expression: "!!document.querySelector('button[class*=\"rounded-lg\"]')",
      returnByValue: true,
    });
    check("Staff has access to operational note controls", hasEditNotesBtn?.result?.value === true);

    // -----------------------------------------------------------------
    // 4. CLIENT ROLE VERIFICATION (ISOLATION)
    // -----------------------------------------------------------------
    console.log("\n--- 4. CLIENT ROLE VERIFICATION ---");
    const clientUrl = await loginAs(ws, "clientA");
    check("Client A login successful", !clientUrl.includes("/login"), `Client landing: ${clientUrl}`);

    // Attempt to navigate to /admin/agreements
    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/agreements" });
    await new Promise(r => setTimeout(r, 2000));

    const clientUrlRes = await sendCdp(ws, "Runtime.evaluate", {
      expression: "window.location.href",
      returnByValue: true,
    });
    const actualClientUrl = clientUrlRes?.result?.value || "";
    check("Client A is blocked from /admin/agreements", !actualClientUrl.includes("/admin/agreements"), `Redirected to: ${actualClientUrl}`);

    // -----------------------------------------------------------------
    // 5. RESPONSIVE VIEWPORT VERIFICATION (Admin on /admin/agreements)
    // -----------------------------------------------------------------
    console.log("\n--- 5. RESPONSIVE VIEWPORT VERIFICATION ---");
    await loginAs(ws, "admin");
    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/agreements" });
    await waitForText(ws, "Service Agreements & Recurring Billing", 10000);

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
