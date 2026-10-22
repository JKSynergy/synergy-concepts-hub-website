// Requester shown for bookings not yet linked to a client (website enquiries).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { requesterFromMetadata, serviceInterestLabel } from "../lib/bookings/requester.ts";

test("website enquiry metadata (lead_*) gives the enquirer's name, email and phone", () => {
  const r = requesterFromMetadata({
    lead_name: "Evelyn Nalukwago", lead_email: "evelyn@example.com", lead_phone: "0700 000 000",
    service_interest: "media", reference: "SCF-2026-0001",
  });
  assert.deepEqual(r, { name: "Evelyn Nalukwago", email: "evelyn@example.com", phone: "0700 000 000" });
});

test("staff-entered metadata (name / full_name / email) still works", () => {
  assert.equal(requesterFromMetadata({ name: "A" }).name, "A");
  assert.equal(requesterFromMetadata({ full_name: "B", email: "b@example.com" }).name, "B");
  assert.equal(requesterFromMetadata({ email: "b@example.com" }).email, "b@example.com");
});

test("empty, blank or non-string values give nulls", () => {
  for (const m of [null, undefined, {}, { lead_name: "  ", lead_email: 5, name: null }]) {
    assert.deepEqual(requesterFromMetadata(m as never), { name: null, email: null, phone: null });
  }
});

test("service interest codes are shown as words; unknown codes pass through", () => {
  assert.equal(serviceInterestLabel("media"), "Creative and media");
  assert.equal(serviceInterestLabel("systems"), "Technology and systems");
  assert.equal(serviceInterestLabel("custom-thing"), "custom-thing");
  assert.equal(serviceInterestLabel(null), null);
});

test("booking list, calendar and detail pages use the shared requester lookup", () => {
  for (const f of ["app/admin/bookings/page.tsx", "app/admin/bookings/calendar/page.tsx", "app/admin/bookings/[id]/page.tsx"]) {
    const src = readFileSync(f, "utf8");
    assert.match(src, /requesterFromMetadata\(/, `${f} must fall back to the enquiry contact`);
  }
});
