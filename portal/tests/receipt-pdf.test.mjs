// Receipt PDF tests: the stamp follows the balance left after the payment
// ("Paid" only when nothing is outstanding), the balance is as at that
// payment, and the minimal layout renders its required content.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import ts from "typescript";
import { renderToBuffer } from "@react-pdf/renderer";
import { pdfPages } from "./helpers/pdf-text.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

async function loadTemplate() {
  const cacheRoot = join(ROOT, "node_modules", ".cache");
  mkdirSync(cacheRoot, { recursive: true });
  const dir = mkdtempSync(join(cacheRoot, "rcpt-"));
  for (const [name, ext] of [["receipt-template", "tsx"], ["invoice-doc", "ts"], ["pdf-theme", "ts"]]) {
    const out = ts
      .transpileModule(readFileSync(join(ROOT, "lib", "pdf", `${name}.${ext}`), "utf8"), {
        fileName: `${name}.${ext}`,
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
      })
      .outputText.replace(/from "\.\/(invoice-doc|pdf-theme)"/g, 'from "./$1.js"');
    writeFileSync(join(dir, `${name}.js`), out);
  }
  const mod = await import(`file://${join(dir, "receipt-template.js")}`);
  await (await import(`file://${join(dir, "pdf-theme.js")}`)).preparePdfFonts();
  return { dir, mod };
}

const invoice = { id: "inv", invoice_number: "SCH-2026-0008", total: 1_000_000, currency: "UGX", status: "partially paid" };
const pay = (id, amount, paid_at) => ({ id, invoice_id: "inv", amount, method: "mobile_money", reference: null, paystack_reference: null, paid_at, created_at: paid_at });
const p1 = pay("p1", 500_000, "2026-10-21T10:00:00+00:00");
const p2 = pay("p2", 500_000, "2026-11-02T09:00:00Z");
const receipt = { id: "r", payment_id: "p1", invoice_id: "inv", receipt_number: "RCP-2026-0003", pdf_url: null, created_at: "" };
const client = { full_name: "Juliet", email: "julesdenise02@gmail.com" };
const png = (f) => `data:image/png;base64,${readFileSync(join(ROOT, "public", "images", f)).toString("base64")}`;

test("receipt: balance is as at the payment; the stamp is Paid only when nothing is left", async () => {
  const { dir, mod } = await loadTemplate();
  try {
    const { balanceAfterPayment, receiptStamp } = mod;
    // First of two payments: half still owed, even after the second one is recorded.
    assert.equal(balanceAfterPayment(invoice, p1, [p1, p2]), 500_000);
    assert.equal(receiptStamp(balanceAfterPayment(invoice, p1, [p1, p2])), "partial");
    // The final payment settles the invoice.
    assert.equal(balanceAfterPayment(invoice, p2, [p1, p2]), 0);
    assert.equal(receiptStamp(0), "paid");
    // A single full payment, and a payment missing from the list, still count.
    assert.equal(balanceAfterPayment(invoice, pay("x", 1_000_000, "2026-10-01T00:00:00Z"), []), 0);
    // Overpayment never shows a negative balance.
    assert.equal(balanceAfterPayment(invoice, pay("y", 1_200_000, "2026-10-01T00:00:00Z"), []), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("receipt: renders the minimal layout with the right figures", async () => {
  const { dir, mod } = await loadTemplate();
  try {
    const buf = await renderToBuffer(
      React.createElement(mod.default, {
        receipt,
        payment: p1,
        invoice,
        client,
        payments: [p1],
        logoSrc: png("sch-logo-mark-pdf.png"),
        paidStampSrc: png("sch-logo-mark-pdf.png"),
        partialStampSrc: png("sch-logo-mark-pdf.png"),
      })
    );
    const pages = pdfPages(buf);
    assert.equal(pages.length, 1, "one page");
    const text = pages[0].join(" ").replace(/\s+/g, " ");
    assert.match(text, /Receipt/);
    assert.match(text, /RCP-2026-0003/);
    assert.match(text, /RECEIVED FROM Juliet/);
    assert.match(text, /21 Oct 2026/);
    assert.match(text, /Mobile Money/);
    assert.match(text, /Balance due UGX 500,000/);
    assert.match(text, /TOTAL PAID UGX 500,000/);
    assert.match(text, /Page 1 of 1/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
