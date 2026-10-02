"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setInvoiceStatus } from "@/lib/actions/invoices";
import { recordPayment } from "@/lib/actions/payments";
import { useFeedback } from "@/components/ux/feedback";
import { Dialog } from "@/components/ux/dialog";
import type { InvoiceStatus } from "@/lib/types";
import { availableInvoiceActions } from "@/lib/finance/lifecycle";

export function RecordPaymentButton({ invoiceId, suggested }: { invoiceId: string; suggested: number | null }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function action(fd: FormData) {
    setLoading(true);
    setError("");
    const res = await recordPayment(invoiceId, fd);
    setLoading(false);
    if (res.error) {
      setError(res.error);
      toast(res.error, "error");
      return;
    }
    setOpen(false);
    toast("Payment recorded");
    router.refresh();
  }

  return (
    <>
      <button type="button" className="ux-btn ux-btn--primary" onClick={() => setOpen(true)}>
        Record payment
      </button>
      {open && (
        <Dialog onClose={() => setOpen(false)} labelledBy="rp-title">
          <>
            <h3 id="rp-title">Record payment</h3>
            <p className="ux-desc">Log a payment received outside the portal. The invoice status updates from the recorded payments.</p>
            {error && (
              <div className="ux-notice ux-notice--error" style={{ marginTop: 16 }}>
                {error}
              </div>
            )}
            <form action={action} style={{ marginTop: 20 }}>
              <div className="ux-formgrid">
                <label className="ux-field">
                  <span>Amount (UGX)</span>
                  <input
                    name="amount"
                    type="number"
                    min={1}
                    required
                    className="ux-input"
                    defaultValue={suggested && suggested > 0 ? suggested : undefined}
                  />
                </label>
                <label className="ux-field">
                  <span>Method</span>
                  <select name="method" required className="ux-input ux-select" defaultValue="mobile_money">
                    <option value="mobile_money">Mobile money</option>
                    <option value="bank_transfer">Bank transfer</option>
                    <option value="cash">Cash</option>
                    <option value="paystack">Paystack</option>
                  </select>
                </label>
                <label className="ux-field ux-full">
                  <span>Reference (optional)</span>
                  <input name="reference" type="text" className="ux-input" />
                </label>
              </div>
              <div className="ux-dialog-actions">
                <button type="button" className="ux-btn ux-btn--secondary" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="ux-btn ux-btn--primary" disabled={loading}>
                  {loading ? "Recording…" : "Record payment"}
                </button>
              </div>
            </form>
          </>
        </Dialog>
      )}
    </>
  );
}

export function StatusActions({ invoiceId, status, hasPayments = false }: { invoiceId: string; status: string; hasPayments?: boolean }) {
  const can = availableInvoiceActions(status, hasPayments);
  const router = useRouter();
  const { toast, confirm: askConfirm } = useFeedback();
  const [busy, setBusy] = useState(false);

  async function change(next: InvoiceStatus, message: string) {
    setBusy(true);
    const res = await setInvoiceStatus(invoiceId, next);
    setBusy(false);
    if (res.error) {
      toast(res.error, "error");
      return;
    }
    toast(message);
    router.refresh();
  }

  async function cancel() {
    const ok = await askConfirm({
      title: "Cancel this invoice?",
      body: "The invoice will be marked cancelled and no longer counts as outstanding. Recorded payments are kept.",
      confirmLabel: "Cancel invoice",
      destructive: true,
    });
    if (ok) await change("cancelled", "Invoice cancelled");
  }

  return (
    <div className="ux-rowactions">
      <button
        type="button"
        className="ux-textbtn"
        disabled={busy || !can.markSent}
        onClick={() => change("sent", "Marked as sent")}
      >
        Mark as sent
      </button>
      <button
        type="button"
        className="ux-textbtn"
        disabled={busy || !can.markOverdue}
        onClick={() => change("overdue", "Marked overdue")}
      >
        Mark overdue
      </button>
      <button
        type="button"
        className="ux-textbtn ux-textbtn--danger"
        disabled={busy || !can.cancel}
        title={can.cancel ? undefined : "A paid, partially paid or cancelled invoice cannot be cancelled"}
        onClick={cancel}
      >
        Cancel invoice
      </button>
    </div>
  );
}
