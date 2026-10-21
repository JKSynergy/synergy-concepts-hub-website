// End-to-end tests of the real /api/quote and /api/quote/catalog route handlers
// against PGlite with all migrations. No network, no real email.
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { createDb, asUser, seed } from "./helpers/db.mjs";

register("./helpers/quote-route-loader.mjs", import.meta.url);
const stub = await import("./helpers/stub-quote-admin.mjs");
const mail = await import("./helpers/stub-quote-email.mjs");
const route = await import("../app/api/quote/route.ts");
const catalogRoute = await import("../app/api/quote/catalog/route.ts");

const ORIGIN = "https://synergyconceptshub.com";
const SEED = JSON.parse(readFileSync("lib/quote/capture-films-catalog.v1.json", "utf8"));
let n = 0;
const rid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const future = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);

process.env.MARKETING_SITE_ORIGIN = `${ORIGIN},https://www.synergyconceptshub.com`;
process.env.ADMIN_NOTIFY_EMAIL = "team@example.test";

async function fresh() {
  const db = await createDb();
  stub.__setDb(db);
  stub.__failRpc(false);
  mail.sent.length = 0;
  return db;
}

function post(body, { origin = ORIGIN, ip = "198.51.100.7", raw } = {}) {
  return route.POST(new Request("https://portal.example/api/quote", {
    method: "POST",
    headers: { "content-type": "application/json", origin, "x-forwarded-for": `${ip}, 10.0.0.1` },
    body: raw ?? JSON.stringify(body),
  }));
}

const legacy = (over = {}) => ({ name: "Ann K", email: "ann@example.test", phone: "", service: "photography", brief: "Business: Synergy Capture Films\nService: Photography\n\nHello", ...over });

const structured = (over = {}, quoteOver = {}, details = {}) => ({
  name: "Grace N", email: "grace@example.test", phone: "+256 700 111222", website: "", elapsed_ms: 40000, request_id: rid(),
  quote: {
    catalog_version: 1, expected_estimate_ugx: 4500000, event: "wedding", services: ["photography", "videography"],
    extras: [{ id: "drone" }, { id: "live_streaming" }], currency: "UGX",
    event_details: { date_fixed: true, date: future, venue: "Speke Resort", district: "Kampala", duration: "Full day", notes: "<b>bold</b> request" },
    logistics: "kampala", ...quoteOver,
  },
  ...over,
});
// apply event_details overrides
function withDetails(body, d) { body.quote.event_details = { ...body.quote.event_details, ...d }; return body; }

test("legacy enquiry form still works: 201, ENQ reference, lead + booking, escaped email, CORS for the approved origin", async () => {
  const db = await fresh();
  const res = await post(legacy({ brief: "<script>x</script> hi" }));
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.match(body.reference, /^ENQ-\d{4}-0001$/);
  assert.equal(res.headers.get("access-control-allow-origin"), ORIGIN);
  assert.equal((await db.query("SELECT count(*)::int n FROM public.leads")).rows[0].n, 1);
  assert.equal((await db.query("SELECT count(*)::int n FROM public.bookings WHERE lead_id IS NOT NULL")).rows[0].n, 1);
  assert.equal(mail.sent.length, 1);
  assert.ok(!mail.sent[0].html.includes("<script>"));
  assert.ok(mail.sent[0].html.includes("&lt;script&gt;"));
});

test("www origin is approved too; unknown origins get the first approved origin", async () => {
  await fresh();
  const www = await post(legacy(), { origin: "https://www.synergyconceptshub.com" });
  assert.equal(www.headers.get("access-control-allow-origin"), "https://www.synergyconceptshub.com");
  const evil = route.OPTIONS(new Request("https://portal.example/api/quote", { method: "OPTIONS", headers: { origin: "https://evil.example" } }));
  assert.equal((await evil).headers.get("access-control-allow-origin"), ORIGIN);
});

test("honeypot and too-fast submissions look successful but store nothing", async () => {
  const db = await fresh();
  assert.equal((await post(legacy({ website: "http://spam" }))).status, 201);
  assert.equal((await post(legacy({ elapsed_ms: 300 }))).status, 201);
  assert.equal((await db.query("SELECT count(*)::int n FROM public.leads")).rows[0].n, 0);
  assert.equal(mail.sent.length, 0);
});

test("invalid input: 400 with field messages; bad JSON 400; oversized 413", async () => {
  const db = await fresh();
  const r = await post(legacy({ email: "nope", name: "" }));
  assert.equal(r.status, 400);
  const b = await r.json();
  assert.deepEqual(b.fields.map((f) => f.field).sort(), ["email", "name"]);
  assert.equal((await post(null, { raw: "{not json" })).status, 400);
  assert.equal((await post(null, { raw: JSON.stringify({ ...legacy(), brief: "x".repeat(40000) }) })).status, 413);
  assert.equal((await db.query("SELECT count(*)::int n FROM public.leads")).rows[0].n, 0);
});

test("database failures return a generic message without internal detail", async () => {
  await fresh();
  stub.__failRpc(true);
  const r = await post(legacy());
  assert.equal(r.status, 500);
  const txt = JSON.stringify(await r.json());
  assert.ok(!/secret_internal|relation|42P01/.test(txt));
});

test("rate limit: sixth request in an hour from one email gets 429", async () => {
  await fresh();
  for (let i = 0; i < 5; i++) assert.equal((await post(legacy(), { ip: `203.0.113.${i}` })).status, 201);
  const r = await post(legacy(), { ip: "203.0.113.99" });
  assert.equal(r.status, 429);
  assert.match((await r.json()).error, /several requests/);
});

test("structured quotation: priced on the server, snapshot stored, SCF reference, one email", async () => {
  const db = await fresh();
  const res = await post(structured());
  assert.equal(res.status, 201);
  const b = await res.json();
  assert.match(b.reference, /^SCF-\d{4}-0001$/);
  assert.equal(b.estimate_ugx, 4500000);
  const q = (await db.query("SELECT * FROM public.quote_requests")).rows[0];
  assert.equal(Number(q.estimate_ugx), 4500000);
  assert.equal(q.lines.find((l) => l.id === "drone").total_ugx, 500000);
  assert.deepEqual(q.special_items.map((s) => s.id), ["live_streaming"]);
  assert.equal(q.logistics, "kampala");
  assert.equal(q.contact.phone, "+256 700 111222");
  assert.equal(q.event_details.notes, "<b>bold</b> request");
  const booking = (await db.query("SELECT title, description, metadata FROM public.bookings")).rows[0];
  assert.equal(booking.title, "Quote request: Wedding, photography and videography");
  assert.match(booking.description, /Drone coverage: UGX 500,000/);
  assert.match(booking.description, /Live streaming: special quotation/);
  assert.equal(booking.metadata.business, "Synergy Capture Films");
  const lead = (await db.query("SELECT service_interest, message FROM public.leads")).rows[0];
  assert.equal(lead.service_interest, "media");
  assert.match(lead.message, /^Business: Synergy Capture Films/);
  assert.equal(mail.sent.length, 1);
  assert.ok(!mail.sent[0].html.includes("<b>bold</b>"), "notes are escaped in email");
});

test("a retried quotation (same request id) is stored once and returns the same reference", async () => {
  const db = await fresh();
  const body = structured();
  const a = await (await post(body)).json();
  const b = await (await post(body)).json();
  assert.equal(a.reference, b.reference);
  assert.equal((await db.query("SELECT count(*)::int n FROM public.quote_requests")).rows[0].n, 1);
  assert.equal(mail.sent.length, 1, "no second email for a duplicate");
});

test("a retry after a price change returns the original reference, not a refusal", async () => {
  const db = await fresh();
  const ids = await seed(db);
  const body = structured();
  const first = await (await post(body)).json();
  await asUser(db, ids.admin, () => db.query("SELECT public.publish_quote_catalog('capture_films', $1::jsonb, 3700, 'new')", [JSON.stringify(SEED)]));
  const retry = await post(body); // still says catalog_version 1
  assert.equal(retry.status, 201);
  const b = await retry.json();
  assert.equal(b.reference, first.reference);
  assert.equal(b.duplicate, true);
  assert.equal((await db.query("SELECT count(*)::int n FROM public.quote_requests")).rows[0].n, 1);
  assert.equal(mail.sent.length, 1);
});

test("manipulated or stale totals are refused with 409, nothing stored", async () => {
  const db = await fresh();
  const tampered = await post(structured({}, { expected_estimate_ugx: 1000 }));
  assert.equal(tampered.status, 409);
  assert.equal((await tampered.json()).code, "estimate_mismatch");
  const stale = await post(structured({}, { catalog_version: 7 }));
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).code, "catalog_changed");
  const priced = await post({ ...structured(), quote: { ...structured().quote, extras: [{ id: "drone", price: 1 }], expected_estimate_ugx: 4500000 } });
  assert.equal(priced.status, 201, "client prices are ignored; server price used");
  const q = (await db.query("SELECT estimate_ugx FROM public.quote_requests")).rows[0];
  assert.equal(Number(q.estimate_ugx), 4500000);
});

test("structured validation: phone required, unavailable extras, past date, missing request id", async () => {
  await fresh();
  assert.equal((await post(structured({ phone: "" }))).status, 400);
  assert.equal((await post(structured({}, { event: "kukyala", expected_estimate_ugx: 2700000, extras: [{ id: "love_story" }] }))).status, 400);
  assert.equal((await post(withDetails(structured(), { date: "2020-01-01" }))).status, 400);
  assert.equal((await post(structured({ request_id: undefined }))).status, 400);
});

test("USD: unavailable until an admin sets a rate; then an indicative conversion is stored with the rate", async () => {
  const db = await fresh();
  const ids = await seed(db);
  const noRate = await post(structured({}, { currency: "USD" }));
  assert.equal(noRate.status, 400);
  await asUser(db, ids.admin, () => db.query("SELECT public.publish_quote_catalog('capture_films', $1::jsonb, 3700, 'rate')", [JSON.stringify(SEED)]));
  const ok = await post(structured({}, { currency: "USD", catalog_version: 2 }));
  assert.equal(ok.status, 201);
  const b = await ok.json();
  assert.equal(b.estimate_usd, 1216.22);
  const q = (await db.query("SELECT currency, ugx_per_usd, estimate_usd, catalog_version FROM public.quote_requests")).rows[0];
  assert.equal(q.currency, "USD");
  assert.equal(Number(q.ugx_per_usd), 3700);
  assert.equal(Number(q.estimate_usd), 1216.22);
  assert.equal(q.catalog_version, 2);
});

test("catalogue endpoint: active version, USD availability, CORS for GET", async () => {
  const db = await fresh();
  const ids = await seed(db);
  const r1 = await catalogRoute.GET(new Request("https://portal.example/api/quote/catalog", { headers: { origin: ORIGIN } }));
  assert.equal(r1.status, 200);
  const c1 = await r1.json();
  assert.equal(c1.version, 1);
  assert.equal(c1.usd_available, false);
  assert.equal(c1.ugx_per_usd, null);
  assert.equal(c1.catalog.events.length, 4);
  assert.equal(r1.headers.get("access-control-allow-origin"), ORIGIN);
  assert.equal(r1.headers.get("access-control-allow-methods"), "GET, OPTIONS");
  await asUser(db, ids.admin, () => db.query("SELECT public.publish_quote_catalog('capture_films', $1::jsonb, 3700, NULL)", [JSON.stringify(SEED)]));
  const c2 = await (await catalogRoute.GET(new Request("https://portal.example/api/quote/catalog"))).json();
  assert.equal(c2.version, 2);
  assert.equal(c2.usd_available, true);
  assert.equal(c2.ugx_per_usd, 3700);
});
