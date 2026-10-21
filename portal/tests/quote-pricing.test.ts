// Capture Films catalogue v1, pricing engine and structured payload validation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCatalog, toUsd, validRate, type Catalog } from "../lib/quote/catalog.ts";
import { priceQuote, extrasFor } from "../lib/quote/pricing.ts";
import { validateQuotePayload, kampalaToday } from "../lib/quote/structured.ts";
import { quoteSummary } from "../lib/quote/summary.ts";

const raw = JSON.parse(readFileSync("lib/quote/capture-films-catalog.v1.json", "utf8"));
const parsed = parseCatalog(raw);
assert.ok(parsed.ok, "seed catalogue must be valid");
const CAT = (parsed as { ok: true; catalog: Catalog }).catalog;
const EVENTS = ["wedding", "kwanjula", "kukyala", "other"];

const price = (sel: Partial<Parameters<typeof priceQuote>[1]>, rate: number | null = null) =>
  priceQuote(CAT, { event: "wedding", services: ["photography", "videography"], extras: [], currency: "UGX", ...sel }, rate);

test("standard prices: photography, videography and both, for every event (supplied table)", () => {
  const expected: Record<string, [number, number]> = { wedding: [2e6, 2e6], kwanjula: [2e6, 2e6], kukyala: [1e6, 1e6], other: [1e6, 1e6] };
  for (const ev of EVENTS) {
    const [ph, vi] = expected[ev];
    const p = price({ event: ev, services: ["photography"] });
    const v = price({ event: ev, services: ["videography"] });
    const b = price({ event: ev });
    assert.ok(p.ok && v.ok && b.ok);
    if (p.ok && v.ok && b.ok) {
      assert.equal(p.quote.estimate_ugx, ph);
      assert.equal(v.quote.estimate_ugx, vi);
      assert.equal(b.quote.estimate_ugx, ph + vi);
    }
  }
});

test("deliverables follow the supplied list", () => {
  const w = price({ event: "wedding" });
  const k = price({ event: "kukyala", services: ["photography"] });
  assert.ok(w.ok && k.ok);
  if (w.ok && k.ok) {
    assert.deepEqual(w.quote.deliverables.photography, [
      "200 edited and printed photographs",
      "One 12×12-inch photo book containing the printed photographs",
      "One 12×16-inch framed print",
    ]);
    assert.deepEqual(w.quote.deliverables.videography, ["Standard HD long video delivered on a flash disk"]);
    assert.equal(k.quote.deliverables.photography[0], "100–150 edited photographs delivered as soft copies");
  }
});

test("extras offered per event match the supplied availability table", () => {
  const ids = (ev: string) => extrasFor(CAT, ev).map((x) => x.id).sort();
  assert.deepEqual(ids("wedding"), ["drone", "edit_25", "edit_45", "extra_photographer", "extra_videographer", "framed_print", "live_streaming", "love_story", "memory_lane", "photo_book", "same_day_edit", "screens", "video_4k"].sort());
  assert.deepEqual(ids("kwanjula"), ["drone", "edit_25", "edit_45", "extra_photographer", "extra_videographer", "framed_print", "live_streaming", "memory_lane", "photo_book", "same_day_edit", "screens", "video_4k"].sort());
  assert.deepEqual(ids("kukyala"), ["drone", "extra_photographer", "extra_videographer", "framed_print", "live_streaming", "photo_book", "screens", "video_4k"].sort());
  assert.deepEqual(ids("other"), ["drone", "extra_photographer", "extra_videographer", "live_streaming", "photo_book", "screens", "social_reel", "video_4k"].sort());
});

test("extra prices match the supplied table", () => {
  const table: Record<string, Record<string, number>> = {
    video_4k: { wedding: 1.5e6, kwanjula: 1.5e6, kukyala: 1.5e6, other: 1.5e6 },
    edit_25: { wedding: 1e6, kwanjula: 1e6 }, edit_45: { wedding: 1e6, kwanjula: 1e6 },
    memory_lane: { wedding: 6e5, kwanjula: 6e5 }, love_story: { wedding: 7e5 },
    same_day_edit: { wedding: 7e5, kwanjula: 7e5 }, drone: { wedding: 5e5, kwanjula: 5e5, kukyala: 5e5, other: 5e5 },
    extra_photographer: { wedding: 7e5, kwanjula: 7e5, kukyala: 7e5, other: 5e5 },
    extra_videographer: { wedding: 7e5, kwanjula: 7e5, kukyala: 7e5, other: 5e5 },
    photo_book: { wedding: 1e6, kwanjula: 1e6, other: 1e6 }, framed_print: { wedding: 2e5, kwanjula: 2e5 },
  };
  for (const [id, byEvent] of Object.entries(table)) {
    for (const [ev, amt] of Object.entries(byEvent)) {
      const r = price({ event: ev, extras: [{ id }] });
      assert.ok(r.ok, `${id}/${ev}`);
      if (r.ok) assert.equal(r.quote.lines.find((l) => l.id === id)?.total_ugx, amt, `${id}/${ev}`);
    }
  }
});

test("special quotation and on-request items are listed separately and never add to the total", () => {
  const r = price({ event: "kukyala", extras: [{ id: "live_streaming" }, { id: "screens" }, { id: "photo_book" }, { id: "framed_print" }] });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.quote.estimate_ugx, 2e6);
    assert.deepEqual(r.quote.special_items.map((s) => [s.id, s.pricing]), [
      ["live_streaming", "special_quote"], ["screens", "special_quote"], ["photo_book", "on_request"], ["framed_print", "on_request"],
    ]);
    assert.equal(r.quote.lines.some((l) => ["live_streaming", "screens", "photo_book", "framed_print"].includes(l.id)), false);
  }
});

test("video upgrades are additions on top of standard videography and need videography", () => {
  const r = price({ event: "wedding", extras: [{ id: "video_4k" }, { id: "edit_25" }, { id: "edit_45" }] });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.quote.estimate_ugx, 4e6 + 1.5e6 + 1e6 + 1e6);
    assert.ok(r.quote.lines.some((l) => l.id === "videography"), "standard video is kept");
  }
  for (const id of ["video_4k", "edit_25", "edit_45"]) {
    const n = price({ event: "wedding", services: ["photography"], extras: [{ id }] });
    assert.equal(n.ok, false, `${id} without videography`);
  }
});

test("social media reels: per-reel quantity, other events only, range enforced", () => {
  const r = price({ event: "other", extras: [{ id: "social_reel", quantity: 4 }] });
  assert.ok(r.ok);
  if (r.ok) {
    const l = r.quote.lines.find((x) => x.id === "social_reel")!;
    assert.equal(l.quantity, 4);
    assert.equal(l.unit_ugx, 150000);
    assert.equal(l.total_ugx, 600000);
    assert.equal(r.quote.estimate_ugx, 2e6 + 600000);
  }
  assert.equal(price({ event: "wedding", extras: [{ id: "social_reel", quantity: 2 }] }).ok, false);
  for (const q of [0, -1, 1.5, 51, undefined]) assert.equal(price({ event: "other", extras: [{ id: "social_reel", quantity: q as number }] }).ok, false);
  assert.equal(price({ event: "wedding", extras: [{ id: "drone", quantity: 3 }] }).ok, false, "fixed items take no quantity");
});

test("unavailable, unknown and duplicated selections are refused", () => {
  assert.equal(price({ event: "kukyala", extras: [{ id: "love_story" }] }).ok, false);
  assert.equal(price({ event: "other", extras: [{ id: "framed_print" }] }).ok, false);
  assert.equal(price({ event: "wedding", extras: [{ id: "free_money" }] }).ok, false);
  assert.equal(price({ event: "wedding", extras: [{ id: "drone" }, { id: "drone" }] }).ok, false);
  assert.equal(price({ event: "funeral" }).ok, false);
  assert.equal(price({ services: [] }).ok, false);
  assert.equal(price({ services: ["photography", "photography"] }).ok, false);
  assert.equal(price({ services: ["catering"] }).ok, false);
});

test("USD: indicative conversion at the configured rate, rounded to cents; unavailable without a valid rate", () => {
  const r = price({ event: "wedding", services: ["photography"], currency: "USD" }, 3700);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.quote.estimate_usd, 540.54);
    assert.equal(r.quote.lines[0].unit_usd, 540.54);
    assert.equal(r.quote.ugx_per_usd, 3700);
    assert.equal(r.quote.estimate_ugx, 2e6, "UGX stays the source of truth");
  }
  for (const bad of [null, 0, -5, Number.NaN, Infinity]) {
    assert.equal(price({ currency: "USD" }, bad as number).ok, false, `rate ${bad}`);
  }
  const ugx = price({ currency: "UGX" }, null);
  assert.ok(ugx.ok, "UGX works without a rate");
  if (ugx.ok) assert.equal(ugx.quote.estimate_usd, null);
  assert.equal(toUsd(1, 3) , 0.33);
  assert.equal(toUsd(2, 3), 0.67);
  assert.equal(validRate("3700"), false);
});

test("catalogue validation rejects malformed price lists", () => {
  const clone = () => JSON.parse(JSON.stringify(raw));
  const a = clone(); a.services[0].prices.wedding = -1;
  const b = clone(); b.extras[0].pricing.wedding = { type: "free" };
  const c = clone(); c.currency = "USD";
  const d = clone(); d.extras.find((x: { id: string }) => x.id === "social_reel").pricing.other.max = 0;
  const e = clone(); e.extras[0].requires = ["catering"];
  const f = clone(); f.services[0].prices.funeral = 5;
  const g = clone(); g.extras[1].pricing.wedding = { type: "fixed", amount: 0.5 };
  for (const bad of [a, b, c, d, e, f, g, null, []]) assert.equal(parseCatalog(bad).ok, false);
});

const TODAY = "2026-10-21";
const goodPayload = () => ({
  catalog_version: 1,
  expected_estimate_ugx: 4000000,
  event: "wedding",
  services: ["photography", "videography"],
  extras: [{ id: "drone" }],
  currency: "UGX",
  event_details: { date_fixed: true, date: "2026-12-12", venue: "Speke Resort", district: "Kampala", duration: "Full day", notes: "Church then reception" },
  logistics: "kampala",
});

test("structured payload: valid request, date not fixed, logistics choices", () => {
  const r = validateQuotePayload(goodPayload(), TODAY);
  assert.ok(r.ok);
  const nf = validateQuotePayload({ ...goodPayload(), event_details: { date_fixed: false, approx_timeframe: "March 2027", venue: "Home", district: "Mbarara" }, logistics: "upcountry_quote" }, TODAY);
  assert.ok(nf.ok);
  if (nf.ok) {
    assert.equal(nf.data.details.date, null);
    assert.equal(nf.data.details.approx_timeframe, "March 2027");
  }
});

test("structured payload: past, invalid and far-future dates, missing venue, bad logistics, manipulated fields", () => {
  const bad = (over: Record<string, unknown>, ev: Record<string, unknown> = {}) =>
    validateQuotePayload({ ...goodPayload(), ...over, event_details: { ...goodPayload().event_details, ...ev } }, TODAY);
  assert.equal(bad({}, { date: "2026-10-20" }).ok, false, "past date");
  assert.equal(bad({}, { date: "2026-02-30" }).ok, false, "invalid date");
  assert.equal(bad({}, { date: "2030-01-01" }).ok, false, "too far ahead");
  assert.equal(bad({}, { date_fixed: "yes" }).ok, false);
  assert.equal(bad({}, { venue: "" }).ok, false);
  assert.equal(bad({}, { district: "x".repeat(101) }).ok, false);
  assert.equal(bad({ logistics: "free_transport" }).ok, false);
  assert.equal(bad({ currency: "EUR" }).ok, false);
  assert.equal(bad({ expected_estimate_ugx: -1 }).ok, false);
  assert.equal(bad({ catalog_version: "1" }).ok, false);
  assert.equal(bad({ extras: [{ id: "drone", quantity: "2" }] }).ok, false);
  assert.equal(bad({ services: "photography" }).ok, false);
  assert.equal(validateQuotePayload(null, TODAY).ok, false);
  assert.ok(bad({}, { date: TODAY }).ok, "today is allowed");
  assert.match(kampalaToday(new Date("2026-10-21T22:30:00Z")), /^2026-10-22$/, "Kampala is UTC+3");
});

test("client-supplied prices are ignored: only selections are read", () => {
  const r = validateQuotePayload({ ...goodPayload(), extras: [{ id: "drone", price: 1 }], total: 1 } as never, TODAY);
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.data.selection.extras, [{ id: "drone" }]);
    const p = priceQuote(CAT, r.data.selection, null);
    assert.ok(p.ok);
    if (p.ok) assert.equal(p.quote.estimate_ugx, 4500000);
  }
});

test("summary text for leads and bookings", () => {
  const p = price({ event: "other", extras: [{ id: "social_reel", quantity: 2 }, { id: "screens" }], currency: "USD" }, 3700);
  const v = validateQuotePayload({ ...goodPayload(), event: "other", logistics: "upcountry_client" }, TODAY);
  assert.ok(p.ok && v.ok);
  if (p.ok && v.ok) {
    const s = quoteSummary(p.quote, v.data.details, v.data.logistics);
    assert.match(s, /^Business: Synergy Capture Films\nService: Other event quotation/);
    assert.match(s, /Social media content × 2 reel: USD 81\.08 \(UGX 300,000\)/);
    assert.match(s, /Screens: special quotation/);
    assert.match(s, /Logistics: Outside Kampala: the client provides transport/);
    assert.match(s, /Exchange rate: 3700 UGX per USD/);
  }
});
