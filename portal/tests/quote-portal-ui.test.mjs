// Source-level guards for the Capture Films quotation screens and actions.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(f, "utf8");

test("quote actions are admin-gated by the shared role helpers and go through the database functions", () => {
  const s = read("lib/actions/quotes.ts");
  assert.match(s, /canReviewQuotes\(role\)/);
  assert.match(s, /canManageQuoteCatalog\(role\)/);
  assert.match(s, /rpc\("add_quote_review"/);
  assert.match(s, /rpc\("publish_quote_catalog"/);
  assert.match(s, /parseCatalog\(/, "the price list is validated before publishing");
  assert.ok(!/from\("quote_(requests|reviews|catalogs)"\)\.(insert|update|delete)/.test(s), "no direct writes");
  const roles = read("lib/security/roles.ts");
  assert.match(roles, /export const canReviewQuotes = isAdmin;/);
  assert.match(roles, /export const canManageQuoteCatalog = isAdmin;/);
});

test("booking page shows the structured quotation and hides internal metadata keys", () => {
  const s = read("app/admin/bookings/[id]/page.tsx");
  assert.match(s, /<QuotePanel /);
  assert.match(s, /canReview=\{canReviewQuotes\(profile\.role\)\}/);
  assert.match(s, /"request_id", "quote_request_id"/);
  const panel = read("app/admin/bookings/[id]/quote-panel.tsx");
  assert.match(panel, /Special quotation/);
  assert.match(panel, /Customer estimate/);
  assert.ok(!/JSON\.stringify/.test(panel), "no raw JSON in the quotation panel");
});

test("review form never edits the submitted request; price list editor uses the shared confirm", () => {
  const form = read("app/admin/bookings/[id]/quote-review-form.tsx");
  assert.match(form, /addQuoteReview\(/);
  assert.ok(!/estimate_ugx"/.test(form), "the customer estimate is not a form field");
  const ed = read("app/admin/services/capture-films/catalog-editor.tsx");
  assert.match(ed, /confirm: askConfirm/);
  assert.match(ed, /publishQuoteCatalog\(/);
});
