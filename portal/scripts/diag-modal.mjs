import { readFileSync } from "node:fs";

const ACCOUNT_FILE = "E:\\SYSTEMS AND WEBSITES\\SCH_Website_Upload\\portal\\.phase2c-accounts.local.json";
const acc = JSON.parse(readFileSync(ACCOUNT_FILE, "utf8")).admin;

async function run() {
  const res = await fetch("http://127.0.0.1:9222/json/list");
  const list = await res.json();
  const page = list.find(p => p.type === "page" && p.url.includes("localhost:3000")) || list[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);

  await new Promise(r => ws.onopen = r);

  function sendCdp(method, params = {}) {
    const id = Math.floor(Math.random() * 1000000);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timeout")), 10000);
      const h = (evt) => {
        const msg = JSON.parse(evt.data);
        if (msg.id === id) {
          clearTimeout(timer);
          ws.removeEventListener("message", h);
          resolve(msg.result);
        }
      };
      ws.addEventListener("message", h);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async function loginAsAdmin() {
    await sendCdp("Network.clearBrowserCookies");
    await sendCdp("Page.navigate", { url: "http://localhost:3000/login" });
    await new Promise(r => setTimeout(r, 2000));

    const script = `
      (() => {
        const emailInput = document.querySelector('input[type="email"]');
        const passInput = document.querySelector('input[type="password"]');
        const submitBtn = document.querySelector('button[type="submit"]');

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
        submitBtn.click();
      })()
    `;

    await sendCdp("Runtime.evaluate", { expression: script });
    await new Promise(r => setTimeout(r, 3000));
  }

  await loginAsAdmin();

  // Navigate to agreements
  await sendCdp("Page.navigate", { url: "http://localhost:3000/admin/agreements" });
  await new Promise(r => setTimeout(r, 3000));

  // Check innerText
  const t = await sendCdp("Runtime.evaluate", { expression: "document.body.innerText", returnByValue: true });
  console.log("INITIAL TEXT SNIPPET:\n", t.result.value.slice(0, 500));

  // Click #btn-generate-invoice
  await sendCdp("Runtime.evaluate", { expression: "document.querySelector('#btn-generate-invoice')?.click()", returnByValue: true });
  await new Promise(r => setTimeout(r, 500));

  // Read modal text
  const m1 = await sendCdp("Runtime.evaluate", { expression: "document.body.innerText", returnByValue: true });
  console.log("\nMODAL OPEN TEXT:\n", m1.result.value.slice(0, 800));

  // Click #submit-generate-invoice
  await sendCdp("Runtime.evaluate", { expression: "document.querySelector('#submit-generate-invoice')?.click()", returnByValue: true });
  await new Promise(r => setTimeout(r, 1500));

  // Read modal text after submit
  const m2 = await sendCdp("Runtime.evaluate", { expression: "document.body.innerText", returnByValue: true });
  console.log("\nMODAL AFTER SUBMIT TEXT:\n", m2.result.value.slice(0, 1000));

  ws.close();
}

run().catch(console.error);
