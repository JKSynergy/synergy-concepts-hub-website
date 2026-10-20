// Pure-logic regression tests: payment intent rules, Paystack signature,
// webhook idempotency and "never guess an invoice".
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  validatePaymentIntent as validateRaw, verifyPaystackSignature, processPaystackWebhook, outstandingMinor, toMinor,
  onlinePaymentCurrencies, onlinePaymentAvailability,
} from "../lib/finance/payments.ts";

// Paystack configured for UGX unless a test says otherwise.
const validatePaymentIntent = (o) => validateRaw({ allowedCurrencies: ["UGX"], ...o });

const SECRET = "sk_test_unit";
const sign = (body, secret = SECRET) => createHmac("sha512", secret).update(body).digest("hex");
const inv = (o = {}) => ({ client_id: "u1", status: "sent", total: 1000, ...o });

// ── payment intent ──────────────────────────────────────────────────────────
test("intent: amount is the server-computed outstanding balance", () => {
  const r = validatePaymentIntent({ invoice: inv(), userId: "u1", settledAmounts: [] });
  assert.deepEqual(r, { ok: true, amountMinor: 100000, currency: "UGX" });
});
test("intent: partial balance after settled payments", () => {
  const r = validatePaymentIntent({ invoice: inv({ status: "partially paid" }), userId: "u1", settledAmounts: [400] });
  assert.equal(r.amountMinor, 60000);
});
test("intent: another client's invoice looks like not found", () => {
  const r = validatePaymentIntent({ invoice: inv(), userId: "u2", settledAmounts: [] });
  assert.equal(r.ok, false); assert.equal(r.status, 404);
});
test("intent: missing invoice", () => {
  assert.equal(validatePaymentIntent({ invoice: null, userId: "u1", settledAmounts: [] }).status, 404);
});
for (const status of ["draft", "cancelled", "paid"]) {
  test(`intent: ${status} invoice cannot be paid`, () => {
    const r = validatePaymentIntent({ invoice: inv({ status }), userId: "u1", settledAmounts: [] });
    assert.equal(r.ok, false); assert.equal(r.status, 409);
  });
}
test("intent: fully settled invoice has no balance", () => {
  const r = validatePaymentIntent({ invoice: inv(), userId: "u1", settledAmounts: [1000] });
  assert.equal(r.ok, false);
});
test("intent: browser amount can only narrow, never exceed", () => {
  const ok = validatePaymentIntent({ invoice: inv(), userId: "u1", settledAmounts: [], requestedAmount: 250 });
  assert.equal(ok.amountMinor, 25000);
  for (const bad of [1000.01, 0, -5, "abc", NaN, Infinity, 10.123]) {
    const r = validatePaymentIntent({ invoice: inv(), userId: "u1", settledAmounts: [], requestedAmount: bad });
    assert.equal(r.ok, false, `should reject ${bad}`);
  }
});
test("money helpers avoid float drift", () => {
  assert.equal(toMinor(0.1 + 0.2), 30);
  assert.equal(outstandingMinor(100, [33.33, 33.33]), 3334);
  assert.equal(outstandingMinor(100, [150]), 0);
});

// ── signature ───────────────────────────────────────────────────────────────
test("signature: valid, invalid, missing, wrong secret, tampered body", () => {
  const body = '{"event":"charge.success"}';
  assert.equal(verifyPaystackSignature(body, sign(body), SECRET), true);
  assert.equal(verifyPaystackSignature(body, "deadbeef", SECRET), false);
  assert.equal(verifyPaystackSignature(body, null, SECRET), false);
  assert.equal(verifyPaystackSignature(body, "", SECRET), false);
  assert.equal(verifyPaystackSignature(body, sign(body, "other"), SECRET), false);
  assert.equal(verifyPaystackSignature(body + " ", sign(body), SECRET), false);
  assert.equal(verifyPaystackSignature(body, sign(body), undefined), false);
});

// ── webhook ─────────────────────────────────────────────────────────────────
function makeStore(payments = []) {
  const flags = []; const settled = [];
  return {
    flags, settled, payments,
    async findPaymentByReference(ref) { return payments.find((p) => p.reference === ref) ?? null; },
    async settlePayment(id, at) {
      const p = payments.find((x) => x.id === id);
      if (p.paid_at) return { status: "already_settled" };
      p.paid_at = at; settled.push(id); return { status: "settled" };
    },
    async flagForReview(f) { flags.push(f); },
  };
}
const ev = (data, event = "charge.success") => JSON.stringify({ event, data });
const call = (store, body, sig = sign(body), extra = {}) =>
  processPaystackWebhook({ rawBody: Buffer.from(body), signature: sig, secret: SECRET, ...extra }, store);
const pending = (currency = "UGX") => ({ id: "p1", reference: "SCH-1", invoice_id: "i1", amount: 500, paid_at: null, invoice_currency: currency });

test("webhook: unsigned / forged / missing secret never touch the store", async () => {
  const s = makeStore([pending()]);
  const body = ev({ reference: "SCH-1", amount: 50000, status: "success" });
  assert.equal((await call(s, body, "bad")).status, 401);
  assert.equal((await call(s, body, null)).status, 401);
  assert.equal((await processPaystackWebhook({ rawBody: body, signature: sign(body), secret: undefined }, s)).status, 500);
  assert.equal(s.settled.length, 0); assert.equal(s.flags.length, 0);
});
test("webhook: valid event settles exactly the matching payment", async () => {
  const s = makeStore([pending()]);
  const r = await call(s, ev({ reference: "SCH-1", amount: 50000, status: "success", currency: "UGX" }), undefined, { allowedCurrencies: ["UGX"] });
  assert.equal(r.status, 200); assert.deepEqual(s.settled, ["p1"]);
});
test("webhook: duplicate delivery does not settle twice", async () => {
  const s = makeStore([pending()]);
  const body = ev({ reference: "SCH-1", amount: 50000, status: "success", currency: "UGX" });
  await call(s, body); const again = await call(s, body);
  assert.equal(again.status, 200); assert.equal(s.settled.length, 1);
});
test("webhook: unknown reference is flagged, never attached to a guessed invoice", async () => {
  const s = makeStore([pending()]);
  const r = await call(s, ev({ reference: "NOPE", amount: 50000, status: "success", customer: { email: "a@b.c" }, metadata: { invoice_id: "i1" } }));
  assert.equal(r.status, 200); assert.equal(s.settled.length, 0);
  assert.equal(s.flags[0].reason, "unmatched_reference");
});
test("webhook: missing reference is flagged", async () => {
  const s = makeStore([pending()]);
  await call(s, ev({ amount: 50000, status: "success" }));
  assert.equal(s.flags[0].reason, "missing_reference"); assert.equal(s.settled.length, 0);
});
test("webhook: amount mismatch, currency mismatch, non-success status are flagged not settled", async () => {
  for (const [data, reason, extra] of [
    [{ reference: "SCH-1", amount: 100, status: "success" }, "amount_mismatch", {}],
    [{ reference: "SCH-1", amount: "50000", status: "success" }, "amount_mismatch", {}],
    [{ reference: "SCH-1", amount: 50000, status: "success", currency: "USD" }, "currency_mismatch", { allowedCurrencies: ["UGX"] }],
    [{ reference: "SCH-1", amount: 50000, status: "success" }, "currency_mismatch", {}],
    [{ reference: "SCH-1", amount: 50000, status: "failed" }, "status_not_success", {}],
  ]) {
    const s = makeStore([pending()]);
    await call(s, ev(data), undefined, extra);
    assert.equal(s.flags[0]?.reason, reason); assert.equal(s.settled.length, 0);
  }
});
test("webhook: other event types are ignored", async () => {
  const s = makeStore([pending()]);
  const r = await call(s, ev({ reference: "SCH-1" }, "charge.failed"));
  assert.equal(r.status, 200); assert.equal(s.settled.length, 0); assert.equal(s.flags.length, 0);
});
test("webhook: database rejection is flagged; transient error asks Paystack to retry", async () => {
  const s = makeStore([pending()]);
  s.settlePayment = async () => ({ status: "rejected", message: "invoice cancelled" });
  const r = await call(s, ev({ reference: "SCH-1", amount: 50000, status: "success", currency: "UGX" }));
  assert.equal(r.status, 200); assert.equal(s.flags[0].reason, "settlement_rejected");
  const s2 = makeStore([pending()]);
  s2.settlePayment = async () => ({ status: "error", message: "db down" });
  assert.equal((await call(s2, ev({ reference: "SCH-1", amount: 50000, status: "success", currency: "UGX" }))).status, 500);
  const s3 = makeStore([pending()]);
  s3.findPaymentByReference = async () => { throw new Error("boom"); };
  assert.equal((await call(s3, ev({ reference: "SCH-1", amount: 50000, status: "success" }))).status, 500);
});
test("webhook: malformed signed JSON is a 400", async () => {
  const s = makeStore();
  assert.equal((await call(s, "not json")).status, 400);
});

// ── currency safety (an invoice settles only in its own currency) ───────────
test("currency config: parsed, normalised, empty means none", () => {
  assert.deepEqual(onlinePaymentCurrencies("UGX"), ["UGX"]);
  assert.deepEqual(onlinePaymentCurrencies(" ugx, USD ,usd"), ["UGX", "USD"]);
  assert.deepEqual(onlinePaymentCurrencies(""), []);
  assert.deepEqual(onlinePaymentCurrencies(undefined), []);
  assert.deepEqual(onlinePaymentCurrencies("UGX;usd,12"), []);
});
test("intent: charged in the invoice's own currency, never the browser's", () => {
  const r = validateRaw({ invoice: inv({ currency: "USD", total: 30 }), userId: "u1", settledAmounts: [], allowedCurrencies: ["UGX", "USD"], currency: "UGX" });
  assert.deepEqual(r, { ok: true, amountMinor: 3000, currency: "USD" });
});
test("intent: USD invoice refused when Paystack is set up for UGX only (and the reverse)", () => {
  const usd = validateRaw({ invoice: inv({ currency: "USD", total: 30 }), userId: "u1", settledAmounts: [], allowedCurrencies: ["UGX"] });
  assert.equal(usd.ok, false); assert.equal(usd.status, 409); assert.match(usd.error, /USD invoices/);
  const ugx = validateRaw({ invoice: inv({ currency: "UGX" }), userId: "u1", settledAmounts: [], allowedCurrencies: ["USD"] });
  assert.equal(ugx.ok, false); assert.match(ugx.error, /UGX invoices/);
});
test("intent: no configured currency means no online payment at all", () => {
  const r = validateRaw({ invoice: inv(), userId: "u1", settledAmounts: [], allowedCurrencies: [] });
  assert.equal(r.ok, false); assert.equal(r.status, 409);
});
test("availability: legacy invoice without a currency is UGX", () => {
  assert.deepEqual(onlinePaymentAvailability(null, ["UGX"]), { available: true, currency: "UGX" });
  assert.equal(onlinePaymentAvailability("USD", ["UGX"]).available, false);
});
test("webhook: USD invoice is never settled by UGX, nor UGX by USD", async () => {
  const usd = makeStore([pending("USD")]);
  await call(usd, ev({ reference: "SCH-1", amount: 50000, status: "success", currency: "UGX" }), undefined, { allowedCurrencies: ["UGX", "USD"] });
  assert.equal(usd.settled.length, 0); assert.equal(usd.flags[0].reason, "currency_mismatch");
  assert.deepEqual(usd.flags[0].details, { expected: "USD", received: "UGX" });
  const ugx = makeStore([pending("UGX")]);
  await call(ugx, ev({ reference: "SCH-1", amount: 50000, status: "success", currency: "USD" }));
  assert.equal(ugx.settled.length, 0); assert.equal(ugx.flags[0].reason, "currency_mismatch");
});
test("webhook: matching USD payment settles; a currency outside the configured list does not", async () => {
  const ok = makeStore([pending("USD")]);
  await call(ok, ev({ reference: "SCH-1", amount: 50000, status: "success", currency: "usd" }), undefined, { allowedCurrencies: ["UGX", "USD"] });
  assert.deepEqual(ok.settled, ["p1"]);
  const off = makeStore([pending("USD")]);
  await call(off, ev({ reference: "SCH-1", amount: 50000, status: "success", currency: "USD" }), undefined, { allowedCurrencies: ["UGX"] });
  assert.equal(off.settled.length, 0); assert.equal(off.flags[0].reason, "currency_mismatch");
});
test("webhook: currency check never bypasses signature, amount or idempotency checks", async () => {
  const s = makeStore([pending("USD")]);
  const body = ev({ reference: "SCH-1", amount: 50000, status: "success", currency: "USD" });
  assert.equal((await call(s, body, "forged")).status, 401);
  await call(s, ev({ reference: "SCH-1", amount: 49999, status: "success", currency: "USD" }));
  assert.equal(s.flags[0].reason, "amount_mismatch");
  await call(s, body); await call(s, body);
  assert.deepEqual(s.settled, ["p1"]);
});
