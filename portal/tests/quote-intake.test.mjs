// Migration 039: atomic, idempotent, rate-limited quote intake.
import assert from "node:assert/strict";
import test from "node:test";
import { createDb, asService, asUser, seed, rejects } from "./helpers/db.mjs";

const HASH = (s) => (s + "0".repeat(64)).slice(0, 64);
const RID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function payload(over = {}) {
  return {
    name: "Test Person",
    email: "person@example.test",
    phone: "+256 700 000000",
    service: "media",
    message: "Business: Synergy Capture Films\nService: Weddings\n\nHello",
    email_hash: HASH("emailhash-person"),
    ip_hash: HASH("iphash-one"),
    ...over,
  };
}

async function submit(db, p) {
  const r = await asService(db, () => db.query("SELECT public.submit_quote_request($1::jsonb) AS r", [JSON.stringify(p)]));
  return r.rows[0].r;
}

test("submit creates a linked lead and booking with an ENQ reference", async () => {
  const db = await createDb();
  const out = await submit(db, payload({ request_id: RID(1) }));
  assert.equal(out.duplicate, false);
  assert.match(out.reference, /^ENQ-\d{4}-0001$/);
  const lead = (await db.query("SELECT * FROM public.leads WHERE id = $1", [out.lead_id])).rows[0];
  assert.equal(lead.email, "person@example.test");
  assert.equal(lead.source, "marketing_site");
  assert.equal(lead.status, "new");
  const b = (await db.query("SELECT * FROM public.bookings WHERE id = $1", [out.booking_id])).rows[0];
  assert.equal(b.lead_id, out.lead_id);
  assert.equal(b.type, "custom_request");
  assert.equal(b.status, "pending");
  assert.equal(b.title, "Quote request: media");
  assert.equal(b.metadata.reference, out.reference);
  assert.equal(b.metadata.request_id, RID(1));
  assert.equal(b.metadata.lead_email, "person@example.test");
});

test("the same request id is stored once and returns the original reference", async () => {
  const db = await createDb();
  const first = await submit(db, payload({ request_id: RID(2) }));
  const again = await submit(db, payload({ request_id: RID(2).toUpperCase() }));
  assert.equal(again.duplicate, true);
  assert.equal(again.reference, first.reference);
  assert.equal(again.booking_id, first.booking_id);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM public.leads")).rows[0].n, 1);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM public.bookings")).rows[0].n, 1);
});

test("submissions without a request id (older cached forms) still work", async () => {
  const db = await createDb();
  const a = await submit(db, payload());
  const b = await submit(db, payload());
  assert.notEqual(a.booking_id, b.booking_id);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM public.bookings")).rows[0].n, 2);
});

test("rate limit: a sixth request from the same email within an hour is refused, nothing is written", async () => {
  const db = await createDb();
  for (let i = 0; i < 5; i++) await submit(db, payload({ ip_hash: HASH(`ip-${i}`) }));
  const e = await rejects(submit(db, payload({ ip_hash: HASH("ip-x") })), "sixth submission");
  assert.match(e.message, /rate_limited/);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM public.leads")).rows[0].n, 5);
  // another address is unaffected
  await submit(db, payload({ email: "other@example.test", email_hash: HASH("emailhash-other"), ip_hash: HASH("ip-y") }));
});

test("rate limit: 20 requests per IP per hour", async () => {
  const db = await createDb();
  for (let i = 0; i < 20; i++) {
    await submit(db, payload({ email: `p${i}@example.test`, email_hash: HASH(`email-${i}`), ip_hash: HASH("same-ip") }));
  }
  const e = await rejects(submit(db, payload({ email: "p99@example.test", email_hash: HASH("email-99"), ip_hash: HASH("same-ip") })));
  assert.match(e.message, /rate_limited/);
});

test("old rate-limit events expire and are pruned", async () => {
  const db = await createDb();
  for (let i = 0; i < 5; i++) await submit(db, payload());
  await db.exec("UPDATE public.quote_intake_events SET created_at = now() - interval '3 days'");
  await submit(db, payload());
  assert.equal((await db.query("SELECT count(*)::int AS n FROM public.quote_intake_events")).rows[0].n, 1);
});

test("malformed input is rejected by the database function itself", async () => {
  const db = await createDb();
  for (const bad of [
    payload({ name: "" }),
    payload({ email: "not-an-email" }),
    payload({ name: "x".repeat(121) }),
    payload({ message: "x".repeat(8001) }),
    payload({ request_id: "not-a-uuid" }),
    payload({ email_hash: "short" }),
  ]) {
    const e = await rejects(submit(db, bad));
    assert.match(e.message, /invalid_input/);
  }
  assert.equal((await db.query("SELECT count(*)::int AS n FROM public.leads")).rows[0].n, 0);
});

test("only the service role may call submit_quote_request; the events table is private", async () => {
  const db = await createDb();
  const ids = await seed(db);
  await submit(db, payload()); // one event row exists
  const p = JSON.stringify(payload());
  // (The test harness re-grants table privileges after migrations, like Supabase's
  // defaults; row-level security with no policies is what keeps the table private.)
  await db.exec("SET ROLE anon");
  try {
    await rejects(db.query("SELECT public.submit_quote_request($1::jsonb)", [p]), "anon execute");
    assert.equal((await db.query("SELECT * FROM public.quote_intake_events")).rows.length, 0);
    await rejects(db.exec(`INSERT INTO public.quote_intake_events (email_hash) VALUES ('${HASH("x")}')`), "anon insert events");
  } finally {
    await db.exec("RESET ROLE");
  }
  await asUser(db, ids.admin, async () => {
    await rejects(db.query("SELECT public.submit_quote_request($1::jsonb)", [p]), "admin user execute");
    assert.equal((await db.query("SELECT * FROM public.quote_intake_events")).rows.length, 0);
  });
});

test("a booking request id is unique at the database level", async () => {
  const db = await createDb();
  await submit(db, payload({ request_id: RID(7) }));
  await rejects(
    db.exec(`INSERT INTO public.bookings (type, status, title, metadata) VALUES ('custom_request','pending','dup','{"request_id":"${RID(7)}"}')`),
    "duplicate request id insert"
  );
});
