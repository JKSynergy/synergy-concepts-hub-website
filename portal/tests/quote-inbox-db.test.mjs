// Inbox data access against the real migrations (PGlite): only Capture Films
// quotation requests are listed, and only admin/staff can read them (RLS).
import assert from "node:assert/strict";
import test from "node:test";
import { createDb, asService, asUser, seed } from "./helpers/db.mjs";

const HASH = (s) => (s + "0".repeat(64)).slice(0, 64);
const RID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const INBOX_SQL = `SELECT q.reference, b.status, (SELECT count(*) FROM public.quote_reviews r WHERE r.quote_request_id = q.id)::int AS reviews
  FROM public.quote_requests q LEFT JOIN public.bookings b ON b.id = q.booking_id
  WHERE q.business = 'capture_films' ORDER BY q.created_at DESC`;

async function submit(db, p) {
  const r = await asService(db, () => db.query("SELECT public.submit_quote_request($1::jsonb) AS r", [JSON.stringify(p)]));
  return r.rows[0].r;
}

test("inbox lists structured Capture Films quotations only, never a plain 'media' enquiry", async () => {
  const db = await createDb();
  const ids = await seed(db);
  const financeId = "00000000-0000-0000-0000-0000000000f1";
  await db.exec(`INSERT INTO auth.users (id, email) VALUES ('${financeId}', 'finance@example.test');
    UPDATE public.profiles SET role = 'finance' WHERE id = '${financeId}';`);
  const cat = (await db.query("SELECT id, version FROM public.quote_catalogs WHERE business='capture_films' ORDER BY version DESC LIMIT 1")).rows[0];

  // A plain website enquiry with service "media" (e.g. a design request): no quotation.
  await submit(db, {
    name: "Design Client", email: "design@example.test", service: "media", message: "Logo design please",
    business: "Synergy Creative Hub", request_id: RID(10), email_hash: HASH("design"), ip_hash: HASH("ip-d"),
  });
  // A structured Capture Films quotation.
  await submit(db, {
    name: "Grace N", email: "grace@example.test", phone: "+256 700 111222", service: "media",
    message: "Wedding quotation", title: "Quote request: Wedding", business: "Synergy Capture Films",
    request_id: RID(11), email_hash: HASH("grace"), ip_hash: HASH("ip-g"),
    quote: {
      business: "capture_films", catalog_id: cat.id, catalog_version: cat.version,
      event_category: "wedding", event_label: "Wedding", currency: "UGX", ugx_per_usd: null,
      services: ["photography"],
      lines: [{ id: "photography", kind: "service", label: "Photography", pricing: "fixed", quantity: 1, unit_ugx: 2000000, total_ugx: 2000000 }],
      special_items: [], deliverables: {}, estimate_ugx: 2000000, estimate_usd: null,
      event_details: { date: "2026-12-12", date_fixed: true, venue: "Speke Resort", district: "Kampala" },
      logistics: "kampala", contact: { name: "Grace N", email: "grace@example.test", phone: "+256 700 111222" },
    },
  });

  const mediaBookings = await asService(db, () =>
    db.query("SELECT count(*)::int AS n FROM public.bookings WHERE metadata->>'service_interest' = 'media'"));
  assert.equal(mediaBookings.rows[0].n, 2, "both enquiries are 'media' bookings");

  await asUser(db, ids.staff, async () => {
    const rows = (await db.query(INBOX_SQL)).rows;
    assert.equal(rows.length, 1, "only the structured quotation is in the inbox");
    assert.match(rows[0].reference, /^SCF-\d{4}-\d{4}$/);
    assert.equal(rows[0].status, "pending");
  });
  await asUser(db, ids.admin, async () => {
    assert.equal((await db.query(INBOX_SQL)).rows.length, 1);
  });
  await asUser(db, financeId, async () => {
    assert.equal((await db.query(INBOX_SQL)).rows.length, 0, "finance cannot read quotations (RLS)");
  });
  await asUser(db, ids.c1, async () => {
    assert.equal((await db.query(INBOX_SQL)).rows.length, 0, "clients cannot read quotations (RLS)");
  });
});
