// Invoice PDF document-system tests.
//
// Verifies the content-driven renderer: natural pagination, continuation
// headers, repeated table headers, section ordering (scope before pricing),
// payment-term precedence, optional sections, and per-page footers.
//
// The template is TSX, so the test transpiles it with the project's TypeScript
// into a temp directory and imports the emitted JS — no bundler required.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import React from "react";
import ts from "typescript";
import { renderToBuffer } from "@react-pdf/renderer";
import { splitLines, splitProjectNotes, defaultScheduleAmounts } from "../lib/pdf/invoice-doc.ts";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function buildTemplate() {
  // Emitted inside the project so the transpiled module can resolve react /
  // @react-pdf/renderer through normal node_modules lookup.
  const cacheRoot = join(ROOT, "node_modules", ".cache");
  mkdirSync(cacheRoot, { recursive: true });
  const dir = mkdtempSync(join(cacheRoot, "invpdf-"));
  for (const [name, ext] of [["invoice-template", "tsx"], ["invoice-doc", "ts"]]) {
    const source = readFileSync(join(ROOT, "lib", "pdf", `${name}.${ext}`), "utf8");
    const out = ts.transpileModule(source, {
      fileName: `${name}.${ext}`,
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText.replace(/from "\.\/invoice-doc"/, 'from "./invoice-doc.js"');
    writeFileSync(join(dir, `${name}.js`), out);
  }
  return dir;
}

function decodePages(buf) {
  const txt = buf.toString("latin1");
  const streams = [...txt.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map((m) => m[1]);
  const pages = [];
  for (const st of streams) {
    try {
      const d = zlib.inflateSync(Buffer.from(st, "latin1")).toString("latin1");
      const arr = d.match(/\[[^\]]*\]\s*TJ/g) || [];
      const lines = arr
        .map((a) =>
          [...a.matchAll(/<([0-9A-Fa-f]+)>/g)]
            .map((x) => Buffer.from(x[1], "hex").toString("latin1"))
            .join("")
        )
        .filter((s) => s.trim());
      if (!lines.length) continue;
      const pg = lines.find((x) => /Page \d+ of/.test(x));
      if (pg) pages[parseInt(pg.match(/\d+/)[0], 10) - 1] = lines;
      else pages.push(lines);
    } catch {
      /* non-text stream */
    }
  }
  return pages;
}

const invoice = (over = {}) => ({
  id: "inv-1",
  invoice_number: "SCH-2026-0001",
  client_id: "c",
  project_id: null,
  status: "sent",
  issue_date: "2026-03-01",
  due_date: "2026-03-15",
  subtotal: 700000,
  tax_amount: 0,
  total_amount: 700000,
  currency: "UGX",
  notes: null,
  created_at: "",
  updated_at: "",
  ...over,
});

const client = {
  id: "c",
  full_name: "Test Client Ltd",
  email: "client@example.com",
  phone: "+256 700 000 000",
};

const li = (i, description, unit_price) => ({
  id: `li-${i}`,
  invoice_id: "inv-1",
  description,
  quantity: 1,
  unit_price,
  amount: unit_price,
  sort_order: i,
});

let InvoicePDF;

test("invoice PDF: small invoice renders required page-1 content; bare invoice renders", async () => {
  const dir = buildTemplate();
  ({ default: InvoicePDF } = await import(`file://${join(dir, "invoice-template.js")}`));
  try {
    const small = await renderToBuffer(
      React.createElement(InvoicePDF, {
        invoice: invoice(),
        lineItems: [li(1, "Room photography", 500000), li(2, "Editing", 200000)],
        client,
        doc: { scope: { title: "Resort shoot", paragraphs: ["One-day production."] } },
      })
    );
    const pages = decodePages(small);
    assert.ok(pages.length >= 1 && pages.length <= 2, `expected 1-2 pages, got ${pages.length}`);
    const p1 = pages[0].join(" ");
    assert.match(p1, /INVOICE/);
    assert.match(p1, /SCOPE OF WORK/);
    assert.match(p1, /INVESTMENT/);
    assert.match(p1, /TOTAL DUE/);
    assert.match(p1, /Page 1 of \d+/);

    const bare = await renderToBuffer(
      React.createElement(InvoicePDF, {
        invoice: invoice(),
        lineItems: [li(1, "Consulting", 150000)],
        client,
        doc: { signature: null, standardTerms: [] },
      })
    );
    assert.ok(decodePages(bare).length >= 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("invoice PDF: large invoice paginates with continuation header + repeated table header", async () => {
  const dir = buildTemplate();
  ({ default: InvoicePDF } = await import(`file://${join(dir, "invoice-template.js")}`));
  try {
    const buf = await renderToBuffer(
      React.createElement(InvoicePDF, {
        invoice: invoice(),
        lineItems: Array.from({ length: 30 }, (_, i) =>
          li(i, `Deliverable ${i + 1} — long description that wraps naturally within the column`, 275000)
        ),
        client,
        doc: {
          scope: {
            title: "Full campaign",
            items: Array.from({ length: 14 }, (_, i) => `Scope component ${i + 1} of the engagement.`),
          },
          projectNotes: Array.from({ length: 12 }, (_, i) => `Project note ${i + 1}: detail.`),
        },
      })
    );
    const pages = decodePages(buf);
    assert.ok(pages.length >= 3, `expected 3+ pages, got ${pages.length}`);

    // Continuation header on pages 2+; absent on page 1
    assert.doesNotMatch(pages[0].slice(0, 4).join(" "), /Invoice\s*SCH-2026-0001/);
    for (let i = 1; i < pages.length; i++) {
      assert.match(pages[i].slice(0, 4).join(" "), /SCH-2026-0001/, `page ${i + 1} missing continuation header`);
      assert.ok(
        pages[i].some((s) => /Page \d+ of \d+/.test(s)),
        `page ${i + 1} missing footer`
      );
    }
    // Table header repeats on continuation pages that contain rows
    const rowPages = pages.filter((p) => p.some((s) => /^Deliverable \d+/.test(s)));
    for (const p of rowPages) {
      assert.ok(p.includes("DESCRIPTION"), "table page missing repeated header");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("invoice PDF: total due and payment details are visible", async () => {
  const dir = buildTemplate();
  ({ default: InvoicePDF } = await import(`file://${join(dir, "invoice-template.js")}`));
  try {
    const buf = await renderToBuffer(
      React.createElement(InvoicePDF, {
        invoice: { ...invoice(), total: 3_600_000, subtotal: 3_600_000, total_amount: 3_600_000 },
        lineItems: [li(1, "Service A", 3_600_000)],
        client,
        doc: {},
      })
    );
    const all = decodePages(buf).flat().join(" ");
    assert.match(all, /UGX 3,600,000/);
    assert.match(all, /PAYMENT DETAILS/);
    assert.match(all, /Bank Transfer/);
    assert.match(all, /Airtel Money/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("invoice PDF: continuation header appears on page 2", async () => {
  const dir = buildTemplate();
  ({ default: InvoicePDF } = await import(`file://${join(dir, "invoice-template.js")}`));
  try {
    const buf = await renderToBuffer(
      React.createElement(InvoicePDF, {
        invoice: invoice(),
        lineItems: Array.from({ length: 20 }, (_, i) =>
          li(i, `Deliverable ${i + 1} — long description that wraps naturally within the column`, 500_000)
        ),
        client,
        doc: {
          projectNotes: Array.from({ length: 10 }, (_, i) => `Project note ${i + 1}: detail.`),
        },
      })
    );
    const pages = decodePages(buf);
    assert.ok(pages.length >= 2, `expected 2+ pages, got ${pages.length}`);
    const p2 = pages[1].join(" ");
    assert.match(p2, /Synergy Concepts Hub/);
    assert.match(p2, /Invoice/);
    assert.ok(pages.slice(1).flat().includes("NOTES"), "notes continue after page 1");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("invoice PDF: invoice-specific payment terms override the defaults", async () => {
  const dir = buildTemplate();
  ({ default: InvoicePDF } = await import(`file://${join(dir, "invoice-template.js")}`));
  try {
    const buf = await renderToBuffer(
      React.createElement(InvoicePDF, {
        invoice: invoice(),
        lineItems: [li(1, "Service", 100000)],
        client,
        doc: {
          paymentTerms: ["75% booking payment.", "25% balance upon delivery."],
          signature: null,
        },
      })
    );
    const all = decodePages(buf).flat().join(" ");
    assert.match(all, /75%/);
    assert.match(all, /25%/);
    assert.doesNotMatch(all, /80%/);
    assert.doesNotMatch(all, /20%/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("invoice PDF: empty sections render nothing; no notes, no scope, no payment block", async () => {
  const dir = buildTemplate();
  ({ default: InvoicePDF } = await import(`file://${join(dir, "invoice-template.js")}`));
  try {
    const buf = await renderToBuffer(
      React.createElement(InvoicePDF, {
        invoice: invoice(),
        lineItems: [li(1, "Service", 100000)],
        client,
        doc: {
          scope: null,
          projectNotes: [],
          paymentTerms: [],
          standardTerms: [],
          paymentMethods: [],
          signature: null,
        },
      })
    );
    const all = decodePages(buf).flat().join(" ");
    assert.doesNotMatch(all, /SCOPE OF WORK/);
    assert.doesNotMatch(all, /\bNOTES\b/);
    assert.doesNotMatch(all, /PAYMENT TERMS/);
    assert.doesNotMatch(all, /STANDARD TERMS/);
    assert.doesNotMatch(all, /PAYMENT DETAILS/);
    // Still a valid one-page document with a footer
    assert.match(all, /Page 1 of 1/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("invoice PDF: scope renders before the pricing table", async () => {
  const dir = buildTemplate();
  ({ default: InvoicePDF } = await import(`file://${join(dir, "invoice-template.js")}`));
  try {
    const buf = await renderToBuffer(
      React.createElement(InvoicePDF, {
        invoice: invoice(),
        lineItems: [li(1, "Service A", 100000)],
        client,
        doc: {
          scope: { title: "Engagement", items: ["Alpha", "Beta", "Gamma"] },
          signature: null,
          standardTerms: [],
          paymentTerms: [],
        },
      })
    );
    const p1 = decodePages(buf)[0];
    const scopeIdx = p1.findIndex((s) => s === "SCOPE OF WORK");
    const tableIdx = p1.findIndex((s) => s === "DESCRIPTION");
    assert.ok(scopeIdx > -1, "scope heading missing");
    assert.ok(tableIdx > -1, "table heading missing");
    assert.ok(scopeIdx < tableIdx, "scope must precede the pricing table");
    // Scope title and items rendered
    assert.ok(p1.includes("Engagement"));
    assert.ok(p1.includes("Alpha") && p1.includes("Gamma"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("splitProjectNotes filters payment-schedule lines but keeps legitimate notes", () => {
  const notes = [
    "75% booking payment upon confirmation.",
    "25% balance due on delivery of final content.",
    "Shoot will start at 8am on location.",
    "Deliverables include edited photos and reels.",
  ].join("\n");
  const result = splitProjectNotes(notes);
  assert.deepEqual(result, [
    "Shoot will start at 8am on location.",
    "Deliverables include edited photos and reels.",
  ]);
});

test("invoice PDF: payment-schedule invoice notes do not appear in Project Notes", async () => {
  const dir = buildTemplate();
  ({ default: InvoicePDF } = await import(`file://${join(dir, "invoice-template.js")}`));
  try {
    const buf = await renderToBuffer(
      React.createElement(InvoicePDF, {
        invoice: invoice(),
        lineItems: [li(1, "Service", 100000)],
        client,
        doc: {
          projectNotes: splitProjectNotes(
            "75% booking payment upon confirmation.\n25% balance due on delivery.\nPlease provide parking access."
          ),
        },
      })
    );
    const all = decodePages(buf).flat().join(" ");
    assert.doesNotMatch(all, /75%/);
    assert.doesNotMatch(all, /25%/);
    assert.match(all, /Please provide parking access/);
    assert.match(all, /80%/);
    assert.match(all, /20%/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── SCH-2026-0006 shape: scope_of_work field, 80/20 schedule, data-driven status ──
const SCOPE_0006 = [
  "Professional room and property photography",
  "Short-form video content / reels for social media and marketing",
  "Staff portraits and environmental/location shots",
  "General resort atmosphere and supporting visual content",
  "Creation of a visual content bank for future marketing use",
  "One-day on-location production at Master Peace Resort, Masindi",
];
const invoice0006 = (over = {}) => ({
  ...invoice(),
  invoice_number: "SCH-2026-0006",
  subtotal: 3_600_000,
  total: 3_600_000,
  tax_rate: 0,
  scope_of_work: SCOPE_0006.join("\n"),
  notes: "75% booking payment upon confirmation.\n25% balance due on delivery of final content.",
  ...over,
});
const items0006 = [
  li(1, "Photography coverage – rooms, property, staff & locations", 1_500_000),
  li(2, "Videography – property footage & short-form content", 1_500_000),
  li(3, "Editing – photo retouching + 5 short reels", 300_000),
  li(4, "Production / equipment / preparation", 300_000),
];
/** Builds the doc exactly as app/api/invoices/[id]/pdf/route.ts does. */
function routeDoc(inv) {
  const doc = {};
  const scope = splitLines(inv.scope_of_work);
  if (scope.length > 0) doc.scope = { items: scope };
  const notes = splitProjectNotes(inv.notes);
  if (notes.length > 0) doc.projectNotes = notes;
  doc.signature = null;
  return doc;
}
async function render0006(over = {}) {
  const dir = buildTemplate();
  ({ default: InvoicePDF } = await import(`file://${join(dir, "invoice-template.js")}`));
  try {
    const inv = invoice0006(over);
    return decodePages(
      await renderToBuffer(React.createElement(InvoicePDF, { invoice: inv, lineItems: items0006, client, doc: routeDoc(inv) }))
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("SCH-2026-0006: scope_of_work renders on page 1 immediately above Investment, with Total Due on page 1", async () => {
  const pages = await render0006();
  const p1 = pages[0];
  const scopeIdx = p1.indexOf("SCOPE OF WORK");
  const investIdx = p1.indexOf("INVESTMENT");
  const tableIdx = p1.indexOf("DESCRIPTION");
  assert.ok(scopeIdx > -1 && investIdx > -1 && tableIdx > -1, "scope, investment and table headings on page 1");
  assert.ok(scopeIdx < investIdx && investIdx < tableIdx, "scope → investment → table");
  // Every scope line sits between the scope heading and the investment heading — nothing else in between.
  assert.deepEqual(p1.slice(scopeIdx + 1, investIdx), SCOPE_0006);
  assert.ok(p1.includes("TOTAL DUE") && p1.includes("UGX 3,600,000"), "total due on page 1");
  // Scope is not repeated further down the document.
  assert.equal(pages.flat().filter((s) => s === SCOPE_0006[0]).length, 1);
});

test("SCH-2026-0006: only the official 80/20 schedule appears; 75/25 is gone", async () => {
  const all = (await render0006()).flat().join(" ");
  assert.match(all, /An 80% deposit is required/);
  assert.match(all, /remaining 20% balance/);
  assert.match(all, /Deposit \(80%\)/);
  assert.match(all, /UGX 2,880,000/);
  assert.match(all, /Balance \(20%\)/);
  assert.match(all, /UGX 720,000/);
  assert.doesNotMatch(all, /75%|25%/);
  // With the schedule lines filtered out, Notes falls back to the standard notes.
  assert.match(all, /Payment due by the due date\./);
  assert.deepEqual(defaultScheduleAmounts(3_600_000), { deposit: 2_880_000, balance: 720_000 });
  assert.deepEqual(defaultScheduleAmounts(1_000_001), { deposit: 800_001, balance: 200_000 }, "amounts always sum to the total");
});

test("invoice PDF: status label is taken from the invoice record, not the template", async () => {
  for (const status of ["draft", "paid", "partially paid", "overdue", "cancelled"]) {
    const p1 = (await render0006({ status }))[0];
    assert.ok(p1.includes(status.toUpperCase()), `${status} shown`);
    assert.ok(!p1.includes("SENT"), `${status}: no hardcoded SENT`);
  }
  assert.ok((await render0006({ status: "sent" }))[0].includes("SENT"));
});
