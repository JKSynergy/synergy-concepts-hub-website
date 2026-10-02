export const OPEN_STATUSES = ["sent", "partially paid", "overdue"];

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export const METHOD_LABEL: Record<string, string> = {
  paystack: "Paystack",
  mobile_money: "Mobile money",
  bank_transfer: "Bank transfer",
  cash: "Cash",
};

export function methodLabel(m: string) {
  return METHOD_LABEL[m] ?? m.replace(/_/g, " ");
}

/** Past its due date and still unpaid (status overdue, or sent / partially paid with a passed due date). */
export function isPastDue(status: string, dueDate: string | null, today: string) {
  if (status === "overdue") return true;
  return !!dueDate && dueDate < today && (status === "sent" || status === "partially paid");
}

/** Balance = invoice total minus recorded payments; only meaningful for open invoices. */
export function openBalance(status: string, total: number, paid: number): number | null {
  if (!OPEN_STATUSES.includes(status)) return null;
  return Math.max(0, total - paid);
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
