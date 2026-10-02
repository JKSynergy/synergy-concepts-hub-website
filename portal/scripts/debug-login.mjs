import { readFileSync } from "node:fs";

const acc = JSON.parse(readFileSync(".phase2c-accounts.local.json", "utf8")).admin;

async function testLogin() {
  const list = await (await fetch("http://127.0.0.1:9223/json/list")).json();
  const page = list.find((p) => p.type === "page");
  if (!page) {
    console.error("No Chrome page found on 9223");
    return;
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));

  let id = 1;
  const send = (method, params = {}) =>
    new Promise((res) => {
      const curId = id++;
      const h = (e) => {
        const m = JSON.parse(e.data);
        if (m.id === curId) {
          ws.removeEventListener("message", h);
          res(m.result);
        }
      };
      ws.addEventListener("message", h);
      ws.send(JSON.stringify({ id: curId, method, params }));
    });

  await send("Page.navigate", { url: "http://localhost:3000/login" });
  await new Promise((r) => setTimeout(r, 2000));

  const script = `
    (() => {
      const emailInput = document.querySelector('input[type="email"]');
      const passInput = document.querySelector('input[type="password"]');
      const submitBtn = document.querySelector('button[type="submit"]');

      const setVal = (el, val) => {
        const valueSetter = Object.getOwnPropertyDescriptor(el, 'value')?.set;
        const proto = Object.getPrototypeOf(el);
        const protoSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (protoSetter && valueSetter !== protoSetter) protoSetter.call(el, val);
        else if (valueSetter) valueSetter.call(el, val);
        else el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };

      if (!emailInput || !passInput) return { ok: false, reason: "Inputs not found" };

      setVal(emailInput, ${JSON.stringify(acc.email)});
      setVal(passInput, ${JSON.stringify(acc.password)});

      if (submitBtn) submitBtn.click();
      return { ok: true, email: emailInput.value, hasPass: !!passInput.value };
    })()
  `;

  const fillRes = await send("Runtime.evaluate", { expression: script, returnByValue: true });
  console.log("Fill result:", fillRes);

  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const url = (await send("Runtime.evaluate", { expression: "window.location.href", returnByValue: true }))?.result?.value;
    console.log(`[${i}] Current URL:`, url);
    if (!url.includes("/login")) break;
  }

  const errRes = await send("Runtime.evaluate", { expression: "document.body.innerText", returnByValue: true });
  console.log("Page text:", errRes?.result?.value);
  ws.close();
}

testLogin().catch(console.error);
