// Itemised service invoice: data builder (service-invoice-doc.ts) and the
// rendered PDF (service-invoice-template.tsx). The template is transpiled with
// the project's TypeScript, as in invoice-pdf.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { renderToBuffer } from "@react-pdf/renderer";
import { pdfPages } from "./helpers/pdf-text.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function build() {
  const cacheRoot = join(ROOT, "node_modules", ".cache");
  mkdirSync(cacheRoot, { recursive: true });
  const dir = mkdtempSync(join(cacheRoot, "svcpdf-"));
  for (const [name, ext, folder = "pdf"] of [
    ["invoice-doc", "ts"],
    ["service-invoice-doc", "ts"],
    ["service-invoice-template", "tsx"],
    ["pdf-theme", "ts"],
    ["response-targets", "ts", "billing"],
  ]) {
    const source = readFileSync(join(ROOT, "lib", folder, `${name}.${ext}`), "utf8");
    const out = ts
      .transpileModule(source, {
        fileName: `${name}.${ext}`,
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
      })
      .outputText.replace(/from "\.\/([\w-]+)"/g, 'from "./$1.js"')
      .replace(/from "\.\.\/billing\/([\w-]+)"/g, 'from "./$1.js"');
    writeFileSync(join(dir, `${name}.js`), out);
  }
  return dir;
}

/** All text in the PDF as one string (embedded fonts decoded via their ToUnicode maps). */
function text(buf) {
  return pdfPages(buf)
    .flat()
    .join(" ")
    .replace(/\s+/g, " ");
}

const dir = build();
const { buildServiceInvoice, fmtPeriod, fmtRange, fmtDuration } = await import(`file://${join(dir, "service-invoice-doc.js")}`);
const { default: ServiceInvoicePDF } = await import(`file://${join(dir, "service-invoice-template.js")}`);
const { DEFAULT_PAYMENT_METHODS } = await import(`file://${join(dir, "invoice-doc.js")}`);
// As the PDF routes do. Without it, glyphs cached while embedding one PDF (e.g.
// the dots inside a colon) lose their text in the next PDF rendered by the same
// process: the USD test below would read "18 75" instead of "18.75".
await (await import(`file://${join(dir, "pdf-theme.js")}`)).preparePdfFonts();
test.after(() => rmSync(dir, { recursive: true, force: true }));

const line = (position, section, description, quantity, unit, unit_price, extra = {}) => ({
  position,
  section,
  description,
  quantity,
  unit,
  unit_price,
  amount: Math.round(quantity * unit_price * 100) / 100,
  period_start: "2026-10-01",
  period_end: "2026-10-31",
  ...extra,
});

const elgonLines = [
  line(0, "Managed System Maintenance & Operational Support", "Routine health checks & preventive maintenance", 4, "checks", 50000),
  line(1, "Managed System Maintenance & Operational Support", "Database maintenance & technical administration", 1, "month", 150000),
  line(2, "Managed System Maintenance & Operational Support", "Remote technical support", 1, "month", 400000),
  line(3, "Managed Hosting & Database Infrastructure", "Production application hosting", 1, "month", 170000),
  line(4, "Managed Hosting & Database Infrastructure", "Daily database backups", 31, "days", 1000),
  line(5, "Managed Hosting & Database Infrastructure", "Resource monitoring", 1, "month", 49000),
];

test("formatting helpers", () => {
  assert.equal(fmtPeriod("2026-10-01", "2026-10-31"), "October 2026");
  assert.equal(fmtPeriod("2026-02-01", "2026-02-28"), "February 2026");
  assert.equal(fmtPeriod("2026-10-06", "2026-10-20"), "06 Oct – 20 Oct 2026");
  assert.equal(fmtRange("2026-12-15", "2027-01-14"), "15 Dec 2026 – 14 Jan 2027");
  assert.equal(fmtRange("2026-10-06", "2026-10-06"), "06 Oct 2026");
  assert.equal(fmtDuration("2026-10-06T06:00:00Z", "2026-10-06T07:05:00Z"), "1h 05m");
  assert.equal(fmtDuration("2026-10-06T06:00:00Z", "2026-10-09T08:00:00Z"), "3d 2h");
});

test("agreement invoice: groups by section, prints DB totals, service record only from real records", async () => {
  const svc = buildServiceInvoice({
    invoice: {
      invoice_number: "SCH-2026-0031",
      status: "sent",
      issue_date: "2026-10-31",
      due_date: "2026-11-14",
      currency: "UGX",
      subtotal: 1000000,
      tax_rate: 0,
      tax_amount: 0,
      total: 1000000,
      service_period_start: "2026-10-01",
      service_period_end: "2026-10-31",
    },
    lines: elgonLines,
    client: { name: "Elgon Bottling Company Limited", lines: ["Mbale, Uganda"] },
    agreement: { name: "Managed System Care", contract_reference: "EBC-MSC-2026", billing_cycle: "monthly" },
    requests: [
      { reference: "SR-2026-0001", summary: "Depot user locked out", work_done: "Access restored.", priority: "normal", billing: "covered", status: "resolved", requested_at: "2026-10-06T06:00:00Z", first_response_at: "2026-10-06T06:48:00Z", resolved_at: "2026-10-06T07:10:00Z" },
      { reference: "SR-2026-0002", summary: "Transfer not in depot stock", priority: "high", billing: "covered", status: "resolved", requested_at: "2026-10-14T08:00:00Z", first_response_at: "2026-10-14T09:05:00Z", resolved_at: "2026-10-14T12:00:00Z" },
      { reference: "SR-2026-0003", summary: "Cancelled ask", priority: "normal", billing: "covered", status: "cancelled", requested_at: "2026-10-15T08:00:00Z" },
    ],
    incidents: [],
    backups: [],
    paymentMethods: DEFAULT_PAYMENT_METHODS,
  });

  assert.equal(svc.servicePeriod, "October 2026");
  assert.deepEqual(svc.groups.map((g) => [g.name, g.lines.length]), [
    ["Managed System Maintenance & Operational Support", 3],
    ["Managed Hosting & Database Infrastructure", 3],
  ]);
  assert.equal(svc.groups[0].lines[0].period, "01 Oct – 31 Oct 2026");
  assert.deepEqual(svc.totals, { subtotal: 1000000, tax: 0, total: 1000000 });
  const labels = svc.metrics.map((m) => m.label);
  assert.deepEqual(labels, ["Support requests", "Median first response", "Resolved", "Incidents"]);
  assert.equal(svc.metrics[0].value, "2"); // cancelled request not counted
  assert.ok(!labels.includes("Backups completed"), "no backup records → no backup figure");
  assert.equal(svc.support.length, 2);
  assert.equal(svc.support[0].date, "06 Oct");

  const buf = await renderToBuffer(ServiceInvoicePDF({ inv: svc }));
  const t = text(buf);
  for (const s of [
    "SCH-2026-0031",
    "Managed System Maintenance & Operational Support",
    "Daily database backups",
    "UGX 1,000,000",
    "SR-2026-0002",
    "Access restored.",
    "EBC-MSC-2026",
  ]) {
    assert.ok(t.includes(s), `PDF is missing "${s}"`);
  }
  assert.ok(!/99\.\d+%|uptime/i.test(t), "no availability figure is printed without monitoring records");
});

test("per-job invoice in USD: cents kept, job report instead of a service record", async () => {
  const svc = buildServiceInvoice({
    invoice: {
      invoice_number: "SCH-2026-0040",
      status: "draft",
      issue_date: "2026-10-21",
      due_date: "2026-11-04",
      currency: "USD",
      subtotal: 33.75,
      tax_rate: 0,
      tax_amount: 0,
      total: 33.75,
      service_period_start: "2026-10-06",
      service_period_end: "2026-10-06",
    },
    lines: [
      line(1, "SR-2026-0004 · Contact form not sending", "Call-out & diagnosis", 1, "visit", 15, { period_start: "2026-10-06", period_end: "2026-10-06" }),
      line(2, "SR-2026-0004 · Contact form not sending", "Technical work", 1.5, "hours", 12.5, { period_start: "2026-10-06", period_end: "2026-10-06" }),
    ],
    client: { name: "Solvers UG", lines: [] },
    agreement: null,
    requests: [
      {
        reference: "SR-2026-0004", summary: "Contact form not sending", work_done: "Mail relay credentials rotated; form re-tested.",
        priority: "high", billing: "chargeable", status: "invoiced", channel: "whatsapp",
        requested_at: "2026-10-06T06:00:00Z", quote_agreed_at: "2026-10-06T06:20:00Z",
        first_response_at: "2026-10-06T06:30:00Z", resolved_at: "2026-10-06T09:00:00Z",
      },
    ],
    paymentMethods: DEFAULT_PAYMENT_METHODS,
  });
  assert.equal(svc.groups.length, 1);
  assert.equal(svc.agreement.billing, "Per job, as quoted");
  assert.equal(svc.agreement.reference, "SR-2026-0004");
  assert.equal(svc.kindLabel, "SUPPORT & MAINTENANCE");
  assert.equal(svc.metricsTitle, "Job Report · SR-2026-0004");
  assert.deepEqual(svc.metrics.map((m) => m.label), ["Reported", "Quote agreed", "First response", "Completed"]);
  assert.equal(svc.metrics[0].value, "06 Oct 09:00"); // East Africa Time
  assert.equal(svc.metrics[1].value, "06 Oct 09:20");
  assert.equal(svc.metrics[2].value, "30m");

  const t = text(await renderToBuffer(ServiceInvoicePDF({ inv: svc })));
  for (const s of ["USD 33.75", "18.75", "12.50", "JOB REPORT · SR-2026-0004", "QUOTE AGREED", "by WhatsApp"]) {
    assert.ok(t.includes(s), `PDF is missing "${s}"`);
  }
  assert.ok(/1\.5\s+hours/.test(t), "quantity and unit are printed together");
  assert.ok(!/SERVICE RECORD/i.test(t), "per-job invoices have no service record");
  assert.ok(!/not billed separately/i.test(t), "a job report is not a covered-service panel");
});

test("annual agreement invoice: discount printed with the totals, targets met, agreement exclusions", async () => {
  const svc = buildServiceInvoice({
    invoice: {
      invoice_number: "SCH-2026-0050",
      status: "sent",
      issue_date: "2027-09-30", // invoiced at the end of the year (in arrears)
      due_date: "2027-10-14",
      currency: "UGX",
      subtotal: 10300000,
      tax_rate: 0,
      tax_amount: 0,
      total: 10300000,
      service_period_start: "2026-10-01",
      service_period_end: "2027-09-30",
    },
    lines: [
      line(0, "Maintenance", "Managed maintenance & support", 12, "months", 750000, { period_start: "2026-10-01", period_end: "2027-09-30" }),
      line(1, "Hosting", "Managed hosting & database", 12, "months", 250000, { period_start: "2026-10-01", period_end: "2027-09-30" }),
      line(2, null, "Annual commitment discount", 1, null, -1700000, { period_start: "2026-10-01", period_end: "2027-09-30" }),
    ],
    client: { name: "Elgon Bottling Company Limited", lines: [] },
    agreement: {
      name: "Managed System Care",
      contract_reference: "EBC-MSC-2026",
      billing_cycle: "annual",
      response_targets: [{ priority: "high", target: "Within 4 business hours", hours: 4 }],
      scope_excluded: "New modules\nHardware and local networks",
    },
    requests: [
      // Wed 14 Oct 09:00 EAT → responded 11:00 EAT: 2 business hours, met.
      { reference: "SR-2026-0015", summary: "Stock sync", priority: "high", billing: "covered", status: "resolved", requested_at: "2026-10-14T06:00:00Z", first_response_at: "2026-10-14T08:00:00Z", resolved_at: "2026-10-14T10:00:00Z" },
      // Fri 16:00 EAT → Mon 12:00 EAT: 1 + 4 = 5 business hours, missed.
      { reference: "SR-2026-0016", summary: "Report slow", priority: "high", billing: "covered", status: "resolved", requested_at: "2026-10-16T13:00:00Z", first_response_at: "2026-10-19T09:00:00Z", resolved_at: "2026-10-19T12:00:00Z" },
    ],
    incidents: [],
    backups: [],
    paymentMethods: DEFAULT_PAYMENT_METHODS,
  });
  assert.equal(svc.groups.length, 2, "the discount is not a group");
  assert.deepEqual(svc.adjustments, [{ label: "Annual commitment discount", amount: -1700000 }]);
  assert.equal(svc.totals.subtotal, 12000000, "subtotal printed before the discount");
  assert.equal(svc.totals.total, 10300000);
  const met = svc.metrics.find((m) => m.label === "Response targets met");
  assert.equal(met.value, "1 / 2");
  assert.deepEqual(svc.notCovered, ["New modules", "Hardware and local networks"]);

  const t = text(await renderToBuffer(ServiceInvoicePDF({ inv: svc })));
  for (const s of ["12,000,000", "Annual commitment discount", "-1,700,000", "UGX 10,300,000", "Hardware and local networks"]) {
    assert.ok(t.includes(s), `PDF is missing "${s}"`);
  }
});

test("an invoice issued in advance prints no service record for the period ahead", () => {
  const svc = buildServiceInvoice({
    invoice: { invoice_number: "SCH-2026-0051", status: "sent", issue_date: "2026-10-01", due_date: "2026-10-15", currency: "UGX",
      subtotal: 1000000, tax_rate: 0, tax_amount: 0, total: 1000000, service_period_start: "2026-10-01", service_period_end: "2026-10-31" },
    lines: [line(0, null, "Managed System Care", 1, "month", 1000000)],
    client: { name: "Elgon", lines: [] },
    agreement: { name: "Managed System Care" },
    requests: [],
    incidents: [],
    backups: [],
    paymentMethods: DEFAULT_PAYMENT_METHODS,
  });
  assert.equal(svc.metrics, undefined);
  assert.equal(svc.support, undefined);
});
