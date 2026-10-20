// Billing periods (must match agreement_charge_period in migration 038) and
// business-hours response targets.
import { test } from "node:test";
import assert from "node:assert/strict";
import { addMonths, periodAt, periodsThrough, periodLabel } from "../lib/billing/periods.ts";
import { businessHoursBetween, measure } from "../lib/billing/response-targets.ts";

test("months are added to the start date with the day clamped", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-01-31", 2), "2026-03-31");
  assert.equal(addMonths("2024-01-31", 1), "2024-02-29");
  assert.equal(addMonths("2026-11-15", 3), "2027-02-15");
});

test("periods: calendar months, in arrears vs in advance, end date cut, annual", () => {
  const c = { start_date: "2026-10-01", end_date: null, billing_cycle: "monthly" };
  assert.deepEqual(periodAt(c, 0, "in_arrears"), { start: "2026-10-01", end: "2026-10-31", invoiceDate: "2026-10-31" });
  assert.deepEqual(periodAt(c, 0, "in_advance"), { start: "2026-10-01", end: "2026-10-31", invoiceDate: "2026-10-01" });
  assert.equal(periodLabel(periodAt(c, 1, "in_arrears")!), "November 2026");
  assert.deepEqual(periodAt({ ...c, start_date: "2026-01-31" }, 0, "x"), { start: "2026-01-31", end: "2026-02-27", invoiceDate: "2026-02-27" });
  const cut = { ...c, end_date: "2027-03-15" };
  assert.equal(periodAt(cut, 5, "in_arrears")!.end, "2027-03-15");
  assert.equal(periodAt(cut, 6, "in_arrears"), null);
  assert.deepEqual(periodAt({ ...c, billing_cycle: "annual" }, 0, "in_advance"), { start: "2026-10-01", end: "2027-09-30", invoiceDate: "2026-10-01" });
  assert.equal(periodAt({ ...c, billing_cycle: "custom" }, 0, "in_arrears"), null);
});

test("periodsThrough stops at the first period not yet invoiceable", () => {
  const ps = periodsThrough({ start_date: "2026-10-01", end_date: null, billing_cycle: "monthly" }, "in_arrears", "2026-11-02");
  assert.deepEqual(ps.map((p) => p.start), ["2026-10-01", "2026-11-01"]);
  assert.equal(periodLabel({ start: "2026-10-15", end: "2026-11-14" }), "15 Oct – 14 Nov 2026");
});

test("business hours: Mon–Fri 08:00–17:00 EAT", () => {
  // Wed 09:00 → 11:00 EAT
  assert.equal(businessHoursBetween("2026-10-14T06:00:00Z", "2026-10-14T08:00:00Z"), 2);
  // Fri 16:00 → Mon 09:00 EAT: 1 + 1
  assert.equal(businessHoursBetween("2026-10-16T13:00:00Z", "2026-10-19T06:00:00Z"), 2);
  // Sat 10:00 → Sat 18:00: none
  assert.equal(businessHoursBetween("2026-10-17T07:00:00Z", "2026-10-17T15:00:00Z"), 0);
  // Before opening counts from 08:00
  assert.equal(businessHoursBetween("2026-10-14T03:00:00Z", "2026-10-14T06:30:00Z"), 1.5);
});

test("measure: met, missed, open past target, no time target", () => {
  const t = [
    { priority: "high", target: "Within 4 business hours", hours: 4 },
    { priority: "change", target: "Assessment and quotation", hours: null },
  ];
  const req = (first?: string) => ({ priority: "high", requested_at: "2026-10-14T06:00:00Z", first_response_at: first ?? null });
  assert.equal(measure(t, req("2026-10-14T09:00:00Z"))!.met, true);
  assert.equal(measure(t, req("2026-10-14T12:00:00Z"))!.met, false);
  assert.equal(measure(t, req(), new Date("2026-10-14T07:00:00Z"))!.met, null);
  assert.equal(measure(t, req(), new Date("2026-10-15T07:00:00Z"))!.met, false);
  assert.equal(measure(t, { priority: "change", requested_at: "2026-10-14T06:00:00Z" })!.met, null);
  assert.equal(measure(t, { priority: "normal", requested_at: "2026-10-14T06:00:00Z" }), null);
});
