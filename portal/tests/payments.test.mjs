// Pure-logic regression tests: payment intent rules, Paystack signature,
// webhook idempotency and "never guess an invoice".
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  validatePaymentIntent, verifyPaystackSignature, processPaystackWebhook, outstandingMinor, toMinor,
} from "../lib/finance/payments.ts";

const SECRET = "sk_test_unit";
const sign = (body, secret = SECRET) => createHmac("sha512", secret).update(body).digest("hex");
const inv = (o = {}) => ({ client_id: "u1", status: "sent", total: 1000, ...o });

// ── payment intent ──────────────────────────────────────────────────────────
test("intent: amount is the server-computed outstanding balance", () => {
  const r = validatePaymentIntent({ invoice: inv(), userId: "u1", settledAmounts: [] });
  assert.deepEqual(r, { ok: true, amountMinor: 100000 });
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
const pending = () => ({ id: "p1", reference: "SCH-1", invoice_id: "i1", amount: 500, paid_at: null });

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
  const r = await call(s, ev({ reference: "SCH-1", amount: 50000, status: "success", currency: "UGX" }), undefined, { expectedCurrency: "UGX" });
  assert.equal(r.status, 200); assert.deepEqual(s.settled, ["p1"]);
});
test("webhook: duplicate delivery does not settle twice", async () => {
  const s = makeStore([pending()]);
  const body = ev({ reference: "SCH-1", amount: 50000, status: "success" });
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
    [{ reference: "SCH-1", amount: 50000, status: "success", currency: "USD" }, "currency_mismatch", { expectedCurrency: "UGX" }],
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
  const r = await call(s, ev({ reference: "SCH-1", amount: 50000, status: "success" }));
  assert.equal(r.status, 200); assert.equal(s.flags[0].reason, "settlement_rejected");
  const s2 = makeStore([pending()]);
  s2.settlePayment = async () => ({ status: "error", message: "db down" });
  assert.equal((await call(s2, ev({ reference: "SCH-1", amount: 50000, status: "success" }))).status, 500);
  const s3 = makeStore([pending()]);
  s3.findPaymentByReference = async () => { throw new Error("boom"); };
  assert.equal((await call(s3, ev({ reference: "SCH-1", amount: 50000, status: "success" }))).status, 500);
});
test("webhook: malformed signed JSON is a 400", async () => {
  const s = makeStore();
  assert.equal((await call(s, "not json")).status, 400);
});
