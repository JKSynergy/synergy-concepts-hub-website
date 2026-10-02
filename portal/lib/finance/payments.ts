// Payment integrity: the one place that decides how much a payment may be for,
// which invoices are payable, and whether a Paystack webhook may be trusted.
//
// This module is deliberately free of framework imports so it can be unit
// tested with plain Node (see tests/payments.test.mjs). The database enforces
// the same rules independently (migration 010, payments_guard); these
// functions produce clear errors before the database is reached.
import { createHmac, timingSafeEqual } from "node:crypto";

// ── Money helpers (integer minor units avoid floating-point drift) ───────────
export function toMinor(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === "") return NaN;
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return NaN;
  return Math.round((n + Number.EPSILON) * 100);
}

export function fromMinor(minor: number): number {
  return minor / 100;
}

/** invoice total - settled payments, never below zero. */
export function outstandingMinor(
  total: number | string,
  settledAmounts: Array<number | string>
): number {
  const paid = settledAmounts.reduce<number>((sum, a) => sum + toMinor(a), 0);
  return Math.max(0, toMinor(total) - paid);
}

// ── Which invoices can be paid online ────────────────────────────────────────
export const PAYABLE_STATUSES = ["sent", "overdue", "partially paid"] as const;

export type PaymentIntentInput = {
  invoice: { client_id: string; status: string; total: number | string } | null;
  userId: string;
  /** amounts of payments with paid_at set (pending attempts do not count) */
  settledAmounts: Array<number | string>;
  /** amount supplied by the browser; optional, and only ever narrows the balance */
  requestedAmount?: unknown;
};

export type PaymentIntentResult =
  | { ok: true; amountMinor: number }
  | { ok: false; status: number; error: string };

export function validatePaymentIntent(input: PaymentIntentInput): PaymentIntentResult {
  const { invoice, userId, settledAmounts, requestedAmount } = input;

  if (!invoice || invoice.client_id !== userId) {
    return { ok: false, status: 404, error: "Not found" };
  }
  if (invoice.status === "paid") {
    return { ok: false, status: 409, error: "This invoice has already been paid." };
  }
  if (invoice.status === "cancelled") {
    return { ok: false, status: 409, error: "This invoice has been cancelled." };
  }
  if (!(PAYABLE_STATUSES as readonly string[]).includes(invoice.status)) {
    return { ok: false, status: 409, error: "This invoice is not open for payment." };
  }

  const outstanding = outstandingMinor(invoice.total, settledAmounts);
  if (outstanding <= 0) {
    return { ok: false, status: 409, error: "This invoice has no outstanding balance." };
  }

  if (requestedAmount === undefined || requestedAmount === null || requestedAmount === "") {
    return { ok: true, amountMinor: outstanding };
  }

  const n = typeof requestedAmount === "string" ? Number(requestedAmount) : requestedAmount;
  if (typeof n !== "number" || !Number.isFinite(n)) {
    return { ok: false, status: 400, error: "Invalid payment amount." };
  }
  if (n <= 0) {
    return { ok: false, status: 400, error: "Payment amount must be greater than zero." };
  }
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) {
    return { ok: false, status: 400, error: "Payment amount can have at most 2 decimal places." };
  }
  const requested = toMinor(n);
  if (requested > outstanding) {
    return { ok: false, status: 400, error: "Payment amount exceeds the outstanding balance." };
  }
  return { ok: true, amountMinor: requested };
}

// ── Paystack webhook ─────────────────────────────────────────────────────────
/** Paystack signs the raw request body with HMAC-SHA512 using the secret key. */
export function verifyPaystackSignature(
  rawBody: Buffer | string,
  signature: string | null | undefined,
  secret: string | null | undefined
): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac("sha512", secret).update(rawBody).digest("hex");
  const given = signature.trim().toLowerCase();
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(given, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export type PendingPayment = {
  id: string;
  invoice_id: string;
  amount: number | string;
  paid_at: string | null;
};

export type SettleResult =
  | { status: "settled" }
  | { status: "already_settled" }
  | { status: "rejected"; message: string } // a business rule refused it (e.g. invoice cancelled)
  | { status: "error"; message: string }; // transient failure: ask Paystack to retry

export type ReviewFlag = {
  reason: string;
  reference?: string | null;
  paymentId?: string | null;
  details?: Record<string, unknown>;
};

export interface WebhookStore {
  findPaymentByReference(reference: string): Promise<PendingPayment | null>;
  /** must only settle a payment whose paid_at is still null (atomic compare-and-set) */
  settlePayment(paymentId: string, paidAtIso: string): Promise<SettleResult>;
  flagForReview(flag: ReviewFlag): Promise<void>;
}

export type WebhookInput = {
  rawBody: Buffer | string;
  signature: string | null;
  secret: string | undefined;
  /** when set, the event currency must match (e.g. "UGX") */
  expectedCurrency?: string | undefined;
  now?: () => Date;
};

export type WebhookResponse = { status: number; body: Record<string, unknown> };

export async function processPaystackWebhook(
  input: WebhookInput,
  store: WebhookStore
): Promise<WebhookResponse> {
  if (!input.secret) {
    return { status: 500, body: { error: "Paystack not configured" } };
  }
  // 1. Authenticity first: nothing below runs for an unsigned or forged call.
  if (!verifyPaystackSignature(input.rawBody, input.signature, input.secret)) {
    return { status: 401, body: { error: "Invalid signature" } };
  }

  let event: {
    event?: unknown;
    data?: {
      reference?: unknown;
      amount?: unknown;
      currency?: unknown;
      status?: unknown;
    };
  };
  try {
    event = JSON.parse(typeof input.rawBody === "string" ? input.rawBody : input.rawBody.toString("utf8"));
  } catch {
    return { status: 400, body: { error: "Invalid payload" } };
  }

  // 2. Only successful charges settle anything.
  if (event.event !== "charge.success") {
    return { status: 200, body: { received: true, ignored: true } };
  }

  const data = event.data ?? {};
  const reference = typeof data.reference === "string" ? data.reference : "";
  if (!reference) {
    await store.flagForReview({ reason: "missing_reference", details: { event: String(event.event) } });
    return { status: 200, body: { received: true, matched: false } };
  }

  try {
    // 3. Match by our own unique reference only. No guessing by e-mail or "latest invoice".
    const payment = await store.findPaymentByReference(reference);
    if (!payment) {
      await store.flagForReview({
        reason: "unmatched_reference",
        reference,
        details: { amount: data.amount, currency: data.currency },
      });
      return { status: 200, body: { received: true, matched: false } };
    }

    // 4. Replay / duplicate delivery: already settled is a success, not a second payment.
    if (payment.paid_at) {
      return { status: 200, body: { received: true, already_processed: true } };
    }

    // 5. The event must describe exactly the payment we created.
    if (data.status !== "success") {
      await store.flagForReview({
        reason: "status_not_success",
        reference,
        paymentId: payment.id,
        details: { status: data.status },
      });
      return { status: 200, body: { received: true, settled: false } };
    }
    const expectedMinor = toMinor(payment.amount);
    if (typeof data.amount !== "number" || data.amount !== expectedMinor) {
      await store.flagForReview({
        reason: "amount_mismatch",
        reference,
        paymentId: payment.id,
        details: { expected_minor: expectedMinor, received_minor: data.amount },
      });
      return { status: 200, body: { received: true, settled: false } };
    }
    if (
      input.expectedCurrency &&
      String(data.currency ?? "").toUpperCase() !== input.expectedCurrency.toUpperCase()
    ) {
      await store.flagForReview({
        reason: "currency_mismatch",
        reference,
        paymentId: payment.id,
        details: { expected: input.expectedCurrency, received: data.currency },
      });
      return { status: 200, body: { received: true, settled: false } };
    }

    // 6. Settle with compare-and-set; the database re-checks balance and invoice state.
    const paidAt = (input.now ? input.now() : new Date()).toISOString();
    const result = await store.settlePayment(payment.id, paidAt);
    if (result.status === "settled") {
      return { status: 200, body: { received: true, settled: true } };
    }
    if (result.status === "already_settled") {
      return { status: 200, body: { received: true, already_processed: true } };
    }
    if (result.status === "rejected") {
      await store.flagForReview({
        reason: "settlement_rejected",
        reference,
        paymentId: payment.id,
        details: { message: result.message },
      });
      return { status: 200, body: { received: true, settled: false } };
    }
    return { status: 500, body: { error: "Temporary failure, please retry" } };
  } catch {
    return { status: 500, body: { error: "Temporary failure, please retry" } };
  }
}
