import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

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
        // ignore parse error of other events
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
    if (currentUrl && !currentUrl.endsWith("/login")) {
      break;
    }
  }
  return currentUrl;
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
  console.log("==================================================");
  console.log("PHASE 3A — REAL BROWSER VERIFICATION");
  console.log("Target: DEV (localhost:3000 against outuocpsotiozkpyksex)");
  console.log("==================================================");

  const wsUrl = await getWsUrl();
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });

  const results = [];
  function check(name, passed, detail = "") {
    results.push({ name, passed, detail });
    console.log(`${passed ? "[PASS]" : "[FAIL]"} ${name} ${detail ? "(" + detail + ")" : ""}`);
  }

  try {
    // -----------------------------------------------------------------
    // 1. ADMIN USER VERIFICATION
    // -----------------------------------------------------------------
    console.log("\n--- 1. ADMIN USER ---");
    const adminLanding = await loginAs(ws, "admin");
    check("Admin login successful", adminLanding.includes("/admin"), `Landing: ${adminLanding}`);

    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/systems" });
    await new Promise(r => setTimeout(r, 2000));

    const adminPageCheck = await sendCdp(ws, "Runtime.evaluate", {
      expression: `
        (() => {
          const bodyText = document.body.innerText;
          const hasTitle = bodyText.includes("Client Digital Systems");
          const hasStandalone = bodyText.includes("Standalone / Independent Resources");
          const btnCreateSystem = !!document.getElementById("btn-create-system");
          const btnCreateResource = !!document.getElementById("btn-create-resource");
          const hasLinkProject = Array.from(document.querySelectorAll("button")).some(b => b.innerText.includes("Link Project"));
          return { hasTitle, hasStandalone, btnCreateSystem, btnCreateResource, hasLinkProject };
        })()
      `,
      returnByValue: true,
    });
    const adminRes = adminPageCheck.result.value;
    check("Admin views Systems directory", adminRes.hasTitle, "Contains Client Digital Systems");
    check("Admin views Standalone Resources", adminRes.hasStandalone, "Contains Standalone section");
    check("Admin has + New System button", adminRes.btnCreateSystem);
    check("Admin has + New Technical Resource button", adminRes.btnCreateResource);
    check("Admin has Link Project capability", adminRes.hasLinkProject);

    // Test Dialog: Open + New System
    await sendCdp(ws, "Runtime.evaluate", {
      expression: `document.getElementById("btn-create-system")?.click()`,
    });
    await new Promise(r => setTimeout(r, 500));
    const dialogSystemCheck = await sendCdp(ws, "Runtime.evaluate", {
      expression: `
        (() => {
          const dialogTitle = document.getElementById("dialog-new-system-title");
          const clientSelect = document.querySelector('select[name="client_id"]');
          const clientCount = clientSelect ? clientSelect.options.length - 1 : 0;
          return { isOpen: !!dialogTitle, clientCount };
        })()
      `,
      returnByValue: true,
    });
    check("Admin opens + New System dialog", dialogSystemCheck.result.value.isOpen, `Clients available: ${dialogSystemCheck.result.value.clientCount}`);

    // Close Dialog
    await sendCdp(ws, "Runtime.evaluate", {
      expression: `Array.from(document.querySelectorAll("button")).find(b => b.innerText === "Cancel")?.click()`,
    });
    await new Promise(r => setTimeout(r, 500));

    // Test Dialog: Open + New Resource
    await sendCdp(ws, "Runtime.evaluate", {
      expression: `document.getElementById("btn-create-resource")?.click()`,
    });
    await new Promise(r => setTimeout(r, 500));
    const dialogResourceCheck = await sendCdp(ws, "Runtime.evaluate", {
      expression: `
        (() => {
          const dialogTitle = document.getElementById("dialog-new-resource-title");
          const providerSelect = document.querySelector('select[name="provider_account_id"]');
          const typeSelect = document.querySelector('select[name="resource_type"]');
          return { isOpen: !!dialogTitle, hasProviders: (providerSelect?.options?.length || 0) > 1, hasTypes: (typeSelect?.options?.length || 0) > 1 };
        })()
      `,
      returnByValue: true,
    });
    check("Admin opens + New Technical Resource dialog", dialogResourceCheck.result.value.isOpen);
    check("Admin resource dialog has provider accounts and types", dialogResourceCheck.result.value.hasProviders && dialogResourceCheck.result.value.hasTypes);

    // Close Dialog
    await sendCdp(ws, "Runtime.evaluate", {
      expression: `Array.from(document.querySelectorAll("button")).find(b => b.innerText === "Cancel")?.click()`,
    });
    await new Promise(r => setTimeout(r, 500));

    // -----------------------------------------------------------------
    // 2. STAFF USER VERIFICATION
    // -----------------------------------------------------------------
    console.log("\n--- 2. STAFF USER ---");
    const staffLanding = await loginAs(ws, "staff");
    check("Staff login successful", staffLanding.includes("/admin"), `Landing: ${staffLanding}`);

    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/systems" });
    await new Promise(r => setTimeout(r, 2000));

    const staffPageCheck = await sendCdp(ws, "Runtime.evaluate", {
      expression: `
        (() => {
          const bodyText = document.body.innerText;
          const hasTitle = bodyText.includes("Client Digital Systems");
          const hasStandalone = bodyText.includes("Standalone / Independent Resources");
          const btnCreateSystem = !!document.getElementById("btn-create-system");
          const btnCreateResource = !!document.getElementById("btn-create-resource");
          const buttons = Array.from(document.querySelectorAll("button")).map(b => b.innerText);
          const hasNotesBtn = buttons.some(t => t.includes("Notes"));
          const hasRetireBtn = buttons.some(t => t.includes("Retire"));
          const hasDeleteBtn = buttons.some(t => t.toLowerCase().includes("delete"));

          // Financial leakage check: scan for financial patterns
          const financialKeywords = ["invoice", "payment", "amount", "due date", "billing status", "$", "kes", "eur"];
          const lowerText = bodyText.toLowerCase();
          const foundFinancial = financialKeywords.filter(k => lowerText.includes(k) && !k.includes("status"));

          return {
            hasTitle,
            hasStandalone,
            btnCreateSystem,
            btnCreateResource,
            hasNotesBtn,
            hasRetireBtn,
            hasDeleteBtn,
            foundFinancial,
          };
        })()
      `,
      returnByValue: true,
    });
    const staffRes = staffPageCheck.result.value;
    check("Staff can view Systems directory", staffRes.hasTitle);
    check("Staff can view Standalone Resources", staffRes.hasStandalone);
    check("Staff cannot create Systems (no btn-create-system)", !staffRes.btnCreateSystem);
    check("Staff cannot create Resources (no btn-create-resource)", !staffRes.btnCreateResource);
    check("Staff can edit operational metadata (Notes button present)", staffRes.hasNotesBtn);
    check("Staff has no destructive retirement controls (no Retire btn)", !staffRes.hasRetireBtn);
    check("Staff has no destructive deletion controls (no Delete btn)", !staffRes.hasDeleteBtn);
    check("Staff view has zero financial leakage", staffRes.foundFinancial.length === 0, `Matches: ${staffRes.foundFinancial.join(", ") || "none"}`);

    // -----------------------------------------------------------------
    // 3. FINANCE USER VERIFICATION
    // -----------------------------------------------------------------
    console.log("\n--- 3. FINANCE USER ---");
    const finLanding = await loginAs(ws, "finance");
    check("Finance login successful", finLanding.includes("/admin"), `Landing: ${finLanding}`);

    // Attempt to navigate to /admin/systems
    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/systems" });
    await new Promise(r => setTimeout(r, 2000));

    const finUrlRes = await sendCdp(ws, "Runtime.evaluate", {
      expression: "window.location.href",
      returnByValue: true,
    });
    const finUrl = finUrlRes?.result?.value || "";
    // Finance cannot access /admin/systems write controls; redirected to /admin/invoices
    check("Finance redirected away from /admin/systems write controls", !finUrl.includes("/admin/systems"), `Redirected to: ${finUrl}`);

    // -----------------------------------------------------------------
    // 4. CLIENT USER VERIFICATION
    // -----------------------------------------------------------------
    console.log("\n--- 4. CLIENT USER ---");
    const clientLanding = await loginAs(ws, "clienta");
    check("Client A login successful", clientLanding.includes("/client"), `Landing: ${clientLanding}`);

    // Attempt to navigate to /admin/systems
    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/systems" });
    await new Promise(r => setTimeout(r, 2000));

    const clientUrlRes = await sendCdp(ws, "Runtime.evaluate", {
      expression: "window.location.href",
      returnByValue: true,
    });
    const clientUrl = clientUrlRes?.result?.value || "";
    check("Client A is blocked from /admin/systems", !clientUrl.includes("/admin/systems"), `Redirected to: ${clientUrl}`);

    // -----------------------------------------------------------------
    // 5. RESPONSIVE VIEWPORT VERIFICATION (Admin on /admin/systems)
    // -----------------------------------------------------------------
    console.log("\n--- 5. RESPONSIVE VIEWPORT VERIFICATION ---");
    await loginAs(ws, "admin");
    await sendCdp(ws, "Page.navigate", { url: "http://localhost:3000/admin/systems" });
    await new Promise(r => setTimeout(r, 2000));

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
            const cardCount = document.querySelectorAll('.ux-card').length;
            return { hasHScroll, cardCount };
          })()
        `,
        returnByValue: true,
      });
      const vpRes = vpCheck.result.value;
      check(`${vp.name}: No unexpected horizontal overflow`, !vpRes.hasHScroll, `Cards rendered: ${vpRes.cardCount}`);
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
