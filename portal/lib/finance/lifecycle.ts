// Invoice lifecycle rules. The database trigger `invoices_status_guard` (migration 012)
// is the source of truth; this module gives server actions readable errors and tells the
// UI which manual actions can possibly succeed. Keep it in step with the trigger.
//
//   draft -> sent -> partially paid -> paid          (payments move the last two automatically)
//
// Rules: an issued invoice never returns to draft; a paid or partially paid invoice
// cannot be cancelled; paid / partially paid can only be reached through recorded payments.
// No void or correction workflow exists (deliberately).

export type InvoiceStatusName = "draft" | "sent" | "partially paid" | "paid" | "overdue" | "cancelled";

export function invoiceTransitionError(
  current: string,
  next: string,
  paidAmount: number,
  total: number
): string | null {
  if (current === next) return null;
  if (next === "draft" && current !== "draft") return "An issued invoice cannot return to draft.";
  if (next === "cancelled" && (current === "paid" || current === "partially paid" || paidAmount > 0)) {
    return "A paid or partially paid invoice cannot be cancelled.";
  }
  if (next === "paid" && !(total > 0 && paidAmount >= total)) {
    return "An invoice becomes paid only when recorded payments cover its total.";
  }
  if (next === "partially paid" && !(paidAmount > 0 && paidAmount < total)) {
    return "An invoice becomes partially paid only when a payment has been recorded against it.";
  }
  if ((next === "sent" || next === "overdue") && paidAmount > 0) {
    return `An invoice with recorded payments cannot return to ${next}.`;
  }
  return null;
}

/** The manual actions the UI may offer for an invoice in this state. */
export function availableInvoiceActions(status: string, hasPayments = false) {
  return {
    markSent: !hasPayments && (status === "draft" || status === "overdue" || status === "cancelled"),
    markOverdue: !hasPayments && status === "sent",
    cancel: status !== "cancelled" && status !== "paid" && status !== "partially paid" && !hasPayments,
  };
}
