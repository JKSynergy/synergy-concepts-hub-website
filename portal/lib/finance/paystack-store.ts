import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/audit";
import type {
  PendingPayment,
  ReviewFlag,
  SettleResult,
  WebhookStore,
} from "@/lib/finance/payments";

// Postgres error codes raised by the payment/invoice guards in migration 010:
//   23514 check_violation, 42501 insufficient_privilege
const BUSINESS_RULE_CODES = new Set(["23514", "42501"]);

/** Supabase-backed store for the Paystack webhook (service-role client, server only). */
export function createPaystackStore(admin: SupabaseClient): WebhookStore {
  return {
    async findPaymentByReference(reference): Promise<PendingPayment | null> {
      const { data, error } = await admin
        .from("payments")
        .select("id, invoice_id, amount, paid_at")
        .eq("paystack_reference", reference)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ?? null;
    },

    async settlePayment(paymentId, paidAtIso): Promise<SettleResult> {
      // Compare-and-set: only a payment that is still unsettled can be settled,
      // so a repeated or concurrent delivery updates zero rows.
      const { data, error } = await admin
        .from("payments")
        .update({ paid_at: paidAtIso })
        .eq("id", paymentId)
        .is("paid_at", null)
        .select("id");

      if (error) {
        return BUSINESS_RULE_CODES.has(error.code ?? "")
          ? { status: "rejected", message: error.message }
          : { status: "error", message: error.message };
      }
      return data && data.length > 0 ? { status: "settled" } : { status: "already_settled" };
    },

    async flagForReview(flag: ReviewFlag): Promise<void> {
      await writeAuditLog(admin, {
        actorId: null,
        action: `paystack.flagged.${flag.reason}`,
        table: "payments",
        recordId: flag.paymentId ?? null,
        details: { reference: flag.reference ?? null, ...(flag.details ?? {}) },
      });
    },
  };
}
