// Migration 040: catalogue versions, immutable quotation snapshots, staff reviews.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createDb, asService, asUser, seed, rejects } from "./helpers/db.mjs";

const HASH = (s) => (s + "0".repeat(64)).slice(0, 64);
const RID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SEED_JSON = JSON.parse(readFileSync("lib/quote/capture-films-catalog.v1.json", "utf8"));

async function active(db) {
  return (await db.query("SELECT id, version, catalog, ugx_per_usd FROM public.quote_catalogs WHERE business='capture_films' ORDER BY version DESC LIMIT 1")).rows[0];
}

function quotePayload(cat, over = {}, quoteOver = {}) {
  return {
    name: "Grace N", email: "grace@example.test", phone: "+256 700 111222",
    service: "media", message: "Business: Synergy Capture Films\nService: Wedding quotation", title: "Quote request: Wedding, photography and videography",
    business: "Synergy Capture Films", request_id: RID(1),
    email_hash: HASH("grace"), ip_hash: HASH("ip-grace"),
    quote: {
      business: "capture_films", catalog_id: cat.id, catalog_version: cat.version,
      event_category: "wedding", event_label: "Wedding", currency: "UGX", ugx_per_usd: null,
      services: ["photography", "videography"],
      lines: [
        { id: "photography", kind: "service", label: "Photography", pricing: "fixed", quantity: 1, unit_ugx: 2000000, total_ugx: 2000000 },
        { id: "videography", kind: "service", label: "Videography", pricing: "fixed", quantity: 1, unit_ugx: 2000000, total_ugx: 2000000 },
        { id: "drone", kind: "extra", label: "Drone coverage", pricing: "fixed", quantity: 1, unit_ugx: 500000, total_ugx: 500000 },
      ],
      special_items: [{ id: "live_streaming", label: "Live streaming", pricing: "special_quote" }],
      deliverables: { photography: ["200 edited and printed photographs"] },
      estimate_ugx: 4500000, estimate_usd: null,
      event_details: { date: "2026-12-12", date_fixed: true, venue: "Speke Resort", district: "Kampala" },
      logistics: "kampala",
      contact: { name: "Grace N", email: "grace@example.test", phone: "+256 700 111222" },
      ...quoteOver,
    },
    ...over,
  };
}

async function submit(db, p) {
  const r = await asService(db, () => db.query("SELECT public.submit_quote_request($1::jsonb) AS r", [JSON.stringify(p)]));
  return r.rows[0].r;
}

test("seed: version 1 equals lib/quote/capture-films-catalog.v1.json and has no exchange rate", async () => {
  const db = await createDb();
  const a = await active(db);
  assert.equal(a.version, 1);
  assert.equal(a.ugx_per_usd, null);
  assert.deepEqual(a.catalog, SEED_JSON);
});

test("structured intake: lead, booking and immutable quotation snapshot in one call, SCF reference", async () => {
  const db = await createDb();
  const cat = await active(db);
  const out = await submit(db, quotePayload(cat));
  assert.match(out.reference, /^SCF-\d{4}-0001$/);
  const q = (await db.query("SELECT * FROM public.quote_requests WHERE id = $1", [out.quote_request_id])).rows[0];
  assert.equal(q.booking_id, out.booking_id);
  assert.equal(q.lead_id, out.lead_id);
  assert.equal(q.reference, out.reference);
  assert.equal(q.catalog_version, 1);
  assert.equal(Number(q.estimate_ugx), 4500000);
  assert.deepEqual(q.services, ["photography", "videography"]);
  assert.equal(q.lines.length, 3);
  assert.equal(q.special_items[0].pricing, "special_quote");
  const b = (await db.query("SELECT metadata, title, lead_id FROM public.bookings WHERE id = $1", [out.booking_id])).rows[0];
  assert.equal(b.metadata.quote_request_id, out.quote_request_id);
  assert.equal(b.metadata.business, "Synergy Capture Films");
  assert.equal(b.title, "Quote request: Wedding, photography and videography");
  // retry with the same request id: original result, nothing new
  const again = await submit(db, quotePayload(cat));
  assert.equal(again.duplicate, true);
  assert.equal(again.reference, out.reference);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM public.quote_requests")).rows[0].n, 1);
});

test("a quotation priced against an old catalogue version is refused, nothing written", async () => {
  const db = await createDb();
  const ids = await seed(db);
  const v1 = await active(db);
  await asUser(db, ids.admin, () => db.query("SELECT public.publish_quote_catalog('capture_films', $1::jsonb, 3700, 'rate set')", [JSON.stringify(SEED_JSON)]));
  const e = await rejects(submit(db, quotePayload(v1)));
  assert.match(e.message, /catalog_changed/);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM public.leads")).rows[0].n, 0);
  const forged = await rejects(submit(db, quotePayload(v1, {}, { catalog_version: 2 })));
  assert.match(forged.message, /catalog_changed/, "version and id must both match the active one");
});

test("structured intake needs a request id and a phone number; snapshot checks hold", async () => {
  const db = await createDb();
  const cat = await active(db);
  assert.match((await rejects(submit(db, quotePayload(cat, { request_id: null })))).message, /invalid_input/);
  assert.match((await rejects(submit(db, quotePayload(cat, { phone: "" })))).message, /invalid_input/);
  // USD snapshot without a rate is rejected by the table checks, and the whole call rolls back
  await rejects(submit(db, quotePayload(cat, { request_id: RID(5) }, { currency: "USD", estimate_usd: 1216.22 })));
  await rejects(submit(db, quotePayload(cat, { request_id: RID(6) }, { logistics: "teleport" })));
  assert.equal((await db.query("SELECT count(*)::int AS n FROM public.leads")).rows[0].n, 0);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM public.bookings")).rows[0].n, 0);
});

test("snapshots are immutable; deleting the booking only clears the link", async () => {
  const db = await createDb();
  const ids = await seed(db);
  const cat = await active(db);
  const out = await submit(db, quotePayload(cat));
  await rejects(db.exec(`UPDATE public.quote_requests SET estimate_ugx = 1 WHERE id = '${out.quote_request_id}'`), "change estimate");
  await rejects(db.exec(`UPDATE public.quote_requests SET lines = '[]' WHERE id = '${out.quote_request_id}'`), "change lines");
  await rejects(db.exec(`DELETE FROM public.quote_requests WHERE id = '${out.quote_request_id}'`), "delete snapshot");
  await asUser(db, ids.admin, () => db.query("SELECT public.delete_booking_admin($1)", [out.booking_id]));
  const q = (await db.query("SELECT booking_id, estimate_ugx FROM public.quote_requests WHERE id = $1", [out.quote_request_id])).rows[0];
  assert.equal(q.booking_id, null);
  assert.equal(Number(q.estimate_ugx), 4500000);
});

test("catalogue: admin publishes new versions; old versions never change; staff cannot publish", async () => {
  const db = await createDb();
  const ids = await seed(db);
  const changed = JSON.parse(JSON.stringify(SEED_JSON));
  changed.extras.find((x) => x.id === "drone").pricing.wedding.amount = 600000;
  const v = await asUser(db, ids.admin, () => db.query("SELECT public.publish_quote_catalog('capture_films', $1::jsonb, 3650.5, 'drone price') AS v", [JSON.stringify(changed)]));
  assert.equal(v.rows[0].v, 2);
  const a = await active(db);
  assert.equal(a.version, 2);
  assert.equal(Number(a.ugx_per_usd), 3650.5);
  const v1 = (await db.query("SELECT catalog FROM public.quote_catalogs WHERE version = 1")).rows[0].catalog;
  assert.deepEqual(v1, SEED_JSON, "version 1 is untouched");
  await rejects(db.exec("UPDATE public.quote_catalogs SET ugx_per_usd = 1 WHERE version = 1"), "edit old version");
  await rejects(db.exec("DELETE FROM public.quote_catalogs WHERE version = 1"), "delete version");
  await asUser(db, ids.staff, async () => {
    await rejects(db.query("SELECT public.publish_quote_catalog('capture_films', $1::jsonb, NULL, NULL)", [JSON.stringify(SEED_JSON)]), "staff publish");
    assert.equal((await db.query("SELECT count(*)::int AS n FROM public.quote_catalogs")).rows[0].n, 2, "staff can read the price list");
  });
  await asUser(db, ids.admin, async () => {
    await rejects(db.query("SELECT public.publish_quote_catalog('capture_films', $1::jsonb, 0, NULL)", [JSON.stringify(SEED_JSON)]), "zero rate");
    await rejects(db.query(`SELECT public.publish_quote_catalog('capture_films', '{"currency":"USD"}'::jsonb, NULL, NULL)`), "non-UGX list");
  });
});

test("reviews: admin adds discount, logistics and final amount; history is append-only; original stays", async () => {
  const db = await createDb();
  const ids = await seed(db);
  const cat = await active(db);
  const out = await submit(db, quotePayload(cat));
  const r1 = await asUser(db, ids.admin, () =>
    db.query("SELECT public.add_quote_review($1, 500000, 4000000, 300000, 'UGX', NULL, 'Loyal client') AS id", [out.quote_request_id]));
  const rev = (await db.query("SELECT * FROM public.quote_reviews WHERE id = $1", [r1.rows[0].id])).rows[0];
  assert.equal(Number(rev.discount_ugx), 500000);
  assert.equal(Number(rev.adjusted_ugx), 4000000);
  assert.equal(Number(rev.logistics_ugx), 300000);
  assert.equal(Number(rev.final_ugx), 4300000);
  assert.equal(Number(rev.final_amount), 4300000);
  assert.equal(rev.reviewed_by, ids.admin);
  const r2 = await asUser(db, ids.admin, () =>
    db.query("SELECT public.add_quote_review($1, 0, 4500000, 0, 'USD', 3700, NULL) AS id", [out.quote_request_id]));
  const usd = (await db.query("SELECT final_amount, final_ugx_per_usd FROM public.quote_reviews WHERE id = $1", [r2.rows[0].id])).rows[0];
  assert.equal(Number(usd.final_amount), 1216.22);
  assert.equal(Number(usd.final_ugx_per_usd), 3700);
  const q = (await db.query("SELECT estimate_ugx FROM public.quote_requests WHERE id = $1", [out.quote_request_id])).rows[0];
  assert.equal(Number(q.estimate_ugx), 4500000, "customer estimate unchanged");
  await rejects(db.exec(`UPDATE public.quote_reviews SET discount_ugx = 0`), "edit review");
  await rejects(db.exec(`DELETE FROM public.quote_reviews`), "delete review");
  await asUser(db, ids.admin, async () => {
    await rejects(db.query("SELECT public.add_quote_review($1, 4500001, 0, 0, 'UGX', NULL, NULL)", [out.quote_request_id]), "discount above estimate");
    await rejects(db.query("SELECT public.add_quote_review($1, 0, -1, 0, 'UGX', NULL, NULL)", [out.quote_request_id]), "negative");
    await rejects(db.query("SELECT public.add_quote_review($1, 0, 1, 0, 'USD', NULL, NULL)", [out.quote_request_id]), "USD without rate");
  });
  await asUser(db, ids.staff, () =>
    rejects(db.query("SELECT public.add_quote_review($1, 0, 1, 0, 'UGX', NULL, NULL)", [out.quote_request_id]), "staff review"));
});

test("visibility: staff and admins read quotations; clients and anon see nothing and cannot write", async () => {
  const db = await createDb();
  const ids = await seed(db);
  const cat = await active(db);
  const out = await submit(db, quotePayload(cat));
  await asUser(db, ids.staff, async () => {
    assert.equal((await db.query("SELECT count(*)::int AS n FROM public.quote_requests")).rows[0].n, 1);
    await rejects(db.exec(`INSERT INTO public.quote_reviews (quote_request_id, adjusted_ugx, final_ugx, final_currency, final_amount) VALUES ('${out.quote_request_id}', 1, 1, 'UGX', 1)`), "staff direct insert review");
  });
  await asUser(db, ids.c1, async () => {
    assert.equal((await db.query("SELECT count(*)::int AS n FROM public.quote_requests")).rows[0].n, 0);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM public.quote_catalogs")).rows[0].n, 0);
    await rejects(db.exec(`INSERT INTO public.quote_reviews (quote_request_id, adjusted_ugx, final_ugx, final_currency, final_amount) VALUES ('${out.quote_request_id}', 1, 1, 'UGX', 1)`), "client insert review");
    await rejects(db.exec(`INSERT INTO public.quote_catalogs (business, version, catalog) VALUES ('capture_films', 9, '{"currency":"UGX"}')`), "client insert catalogue");
  });
  await db.exec("SET ROLE anon");
  try {
    // (harness re-grants SELECT like Supabase defaults; the policies cover signed-in staff only)
    assert.equal((await db.query("SELECT * FROM public.quote_requests")).rows.length, 0);
    assert.equal((await db.query("SELECT * FROM public.quote_catalogs")).rows.length, 0);
    await rejects(db.query("SELECT public.submit_quote_request('{}'::jsonb)"), "anon submit");
  } finally {
    await db.exec("RESET ROLE");
  }
});

test("migrations 039 and 040 apply in order on top of existing leads and bookings, leaving them unchanged", async () => {
  const db = await createDb({ upTo: "038_agreement_contracts.sql" });
  await db.exec(`
    INSERT INTO public.leads (id, name, email, service_interest, message, source, status)
      VALUES ('00000000-0000-4000-8000-0000000000e1', 'Old Lead', 'old@example.test', 'media', 'Earlier enquiry', 'marketing_site', 'contacted');
    INSERT INTO public.bookings (id, type, status, title, description, metadata)
      VALUES ('00000000-0000-4000-8000-0000000000e2', 'custom_request', 'confirmed', 'Quote request: media', 'Earlier', '{"lead_email":"old@example.test","service_interest":"media"}');
  `);
  const before = (await db.query("SELECT * FROM public.bookings")).rows[0];
  for (const f of ["039_quote_intake_hardening.sql", "040_capture_films_quotes.sql"]) {
    await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
  }
  const after = (await db.query("SELECT * FROM public.bookings")).rows[0];
  assert.equal(after.lead_id, null, "existing bookings get no lead link");
  for (const k of ["id", "type", "status", "title", "description"]) assert.equal(after[k], before[k]);
  assert.deepEqual(after.metadata, before.metadata);
  assert.equal((await db.query("SELECT status FROM public.leads")).rows[0].status, "contacted");
  assert.equal((await db.query("SELECT count(*)::int n FROM public.quote_catalogs")).rows[0].n, 1);
  // re-running 040's seed does not duplicate the catalogue (guarded insert)
  await db.exec(`INSERT INTO public.quote_catalogs (business, version, catalog, ugx_per_usd, note)
    SELECT 'capture_films', 1, '{"currency":"UGX"}'::jsonb, NULL, 'x'
    WHERE NOT EXISTS (SELECT 1 FROM public.quote_catalogs WHERE business = 'capture_films')`);
  assert.equal((await db.query("SELECT count(*)::int n FROM public.quote_catalogs")).rows[0].n, 1);
  // a new enquiry still works after both migrations
  const r = await asService(db, () => db.query("SELECT public.submit_quote_request($1::jsonb) AS r", [JSON.stringify({
    name: "New", email: "new@example.test", email_hash: HASH("new"), message: "hi" })]));
  assert.match(r.rows[0].r.reference, /^ENQ-/);
});
