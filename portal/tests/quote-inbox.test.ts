// Capture Films quotation inbox: row building (lib/quote/inbox.ts) and page guards.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyInboxFilter, buildInboxRows, eventDateText, parseInboxFilter, type InboxRequest } from "../lib/quote/inbox.ts";

const req = (over: Partial<InboxRequest> = {}): InboxRequest => ({
  id: "q1", reference: "SCF-2026-0001", booking_id: "b1", event_label: "Wedding",
  event_details: { date: "2026-11-07", date_fixed: true, venue: "Munyonyo" },
  currency: "UGX", estimate_ugx: 6900000, estimate_usd: null,
  contact: { name: "Evelyn N", email: "e@example.test", phone: "0700 000 000" },
  created_at: "2026-10-21T22:45:00Z", ...over,
});

test("a row carries reference, contact, event, date, estimate, booking status and a link to the booking", () => {
  const [r] = buildInboxRows([req()], [{ id: "b1", status: "pending" }], []);
  assert.equal(r.reference, "SCF-2026-0001");
  assert.equal(r.contactName, "Evelyn N");
  assert.equal(r.contactEmail, "e@example.test");
  assert.equal(r.event, "Wedding");
  assert.equal(r.eventDate, "2026-11-07");
  assert.equal(r.estimateUgx, 6900000);
  assert.equal(r.status, "pending");
  assert.equal(r.reviewed, null);
  assert.equal(r.bookingHref, "/admin/bookings/b1");
});

test("the latest review is shown; earlier reviews are history", () => {
  const [r] = buildInboxRows([req()], [{ id: "b1", status: "pending" }], [
    { quote_request_id: "q1", final_amount: 6700000, final_currency: "UGX", created_at: "2026-10-21T22:47:00Z" },
    { quote_request_id: "q1", final_amount: 6500000, final_currency: "UGX", created_at: "2026-10-22T08:00:00Z" },
    { quote_request_id: "other", final_amount: 1, final_currency: "UGX", created_at: "2026-10-23T08:00:00Z" },
  ]);
  assert.deepEqual(r.reviewed, { amount: 6500000, currency: "UGX", at: "2026-10-22T08:00:00Z" });
});

test("deleted booking: no status and no link (the quotation snapshot itself is kept)", () => {
  const [a] = buildInboxRows([req({ booking_id: null })], [], []);
  assert.equal(a.status, null);
  assert.equal(a.bookingHref, null);
  const [b] = buildInboxRows([req({ booking_id: "gone" })], [], []);
  assert.equal(b.bookingHref, null);
});

test("USD quotations keep the USD estimate; numeric strings from Postgres are converted", () => {
  const [r] = buildInboxRows([req({ currency: "USD", estimate_usd: "1864.86" })], [{ id: "b1", status: "pending" }], []);
  assert.equal(r.currency, "USD");
  assert.equal(r.estimateUsd, 1864.86);
});

test("event date: fixed date, flexible timeframe, or not given", () => {
  assert.equal(eventDateText({ date: "2026-12-12", date_fixed: true }), "2026-12-12");
  assert.equal(eventDateText({ date_fixed: false, approx_timeframe: "March 2027" }), "Not fixed: March 2027");
  assert.equal(eventDateText({ date_fixed: false }), "Not fixed");
  assert.equal(eventDateText(null), "Not given");
});

test("filter: all or not reviewed; anything else means all", () => {
  const rows = buildInboxRows([req(), req({ id: "q2", reference: "SCF-2026-0002" })], [], [
    { quote_request_id: "q1", final_amount: 1, final_currency: "UGX", created_at: "2026-10-22T00:00:00Z" },
  ]);
  assert.deepEqual(applyInboxFilter(rows, parseInboxFilter("unreviewed")).map((r) => r.reference), ["SCF-2026-0002"]);
  assert.equal(applyInboxFilter(rows, parseInboxFilter("anything")).length, 2);
});

test("inbox page: staff/admin guard, capture_films filter only, read-only, review stays on the booking page", () => {
  const src = readFileSync("app/admin/services/capture-films/quotations/page.tsx", "utf8");
  assert.match(src, /if \(!profile \|\| !isOperationalStaff\(profile\.role\)\) redirect\("\/client"\)/);
  assert.match(src, /\.from\("quote_requests"\)[\s\S]*?\.eq\("business", "capture_films"\)/);
  assert.ok(!/service_interest|\bmedia\b/.test(src), "must not classify by service_interest / media");
  assert.ok(!/\.(insert|update|upsert|delete|rpc)\(/.test(src), "inbox must not write");
  assert.ok(!/target=/.test(src), "same-tab links only");
  assert.match(src, /canReviewQuotes\(profile\.role\)/);
});
