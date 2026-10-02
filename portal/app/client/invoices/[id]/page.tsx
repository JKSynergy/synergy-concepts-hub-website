"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { NavLink as Link } from "@/components/nav-link";
import { useFeedback } from "@/components/ux/feedback";
import { INVOICE_TONE, PageHeader, Section, StatusMark, ugx } from "@/components/ux/primitives";
import {
  type Invoice,
  type InvoiceLineItem,
  type Payment,
  type Receipt,
} from "@/lib/types";

export default function ClientInvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [outstanding, setOutstanding] = useState(0);
  const [payable, setPayable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);
  const { toast } = useFeedback();

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/invoices/${id}`);
        if (!res.ok) throw new Error("Failed to load invoice");
        const data = await res.json();
        setInvoice(data.invoice);
        setLineItems(data.lineItems ?? []);
        setPayments(data.payments ?? []);
        setReceipts(data.receipts ?? []);
        setOutstanding(Number(data.outstanding ?? 0));
        setPayable(Boolean(data.payable));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [id]);

  async function handlePaystack() {
    if (!invoice) return;
    setPaying(true);
    try {
      const res = await fetch("/api/paystack/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: invoice.id }),
      });
      const data = await res.json();
      if (data.authorization_url) {
        window.location.href = data.authorization_url;
      } else {
        toast(data.error || "Payment initialization failed. Please try again.", "error");
        setPaying(false);
      }
    } catch (e) {
      toast((e as Error).message || "Payment initialization failed. Please try again.", "error");
      setPaying(false);
    }
  }

  const back = (
    <Link href="/client/invoices" className="ux-back">
      ← Invoices
    </Link>
  );
  if (loading) return <div className="ux-page"><div className="ux-loading">Loading…</div></div>;
  if (error)
    return (
      <div className="ux-page">
        {back}
        <div className="ux-notice ux-notice--error">{error}</div>
      </div>
    );
  if (!invoice)
    return (
      <div className="ux-page">
        {back}
        <div className="ux-empty"><b>Invoice not found</b></div>
      </div>
    );

  const receiptMap = new Map(receipts.map((r) => [r.payment_id, r]));
  const fmt = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const paidTotal = payments.filter((p) => p.paid_at).reduce((sum, p) => sum + Number(p.amount), 0);

  return (
    <div className="ux-page">
      {back}
      <PageHeader
        eyebrow="Invoice"
        title={invoice.invoice_number}
        description={payable ? "Pay securely online with Paystack (cards and mobile money)." : undefined}
        actions={
          <>
            <a href={`/api/invoices/${invoice.id}/pdf`} className="ux-btn ux-btn--secondary">
              Download PDF
            </a>
            {payable && (
              <button type="button" onClick={handlePaystack} disabled={paying} className="ux-btn ux-btn--primary">
                {paying ? "Redirecting…" : `Pay ${ugx(outstanding)}`}
              </button>
            )}
          </>
        }
      />

      <div className="ux-figures">
        <div className="ux-figure">
          <span>Status</span>
          <b><StatusMark tone={INVOICE_TONE[invoice.status] ?? "neutral"}>{invoice.status}</StatusMark></b>
        </div>
        <div className="ux-figure">
          <span>Issued</span>
          <b>{invoice.issue_date ? fmt(invoice.issue_date) : "—"}</b>
        </div>
        <div className="ux-figure">
          <span>Due</span>
          <b>{invoice.due_date ? fmt(invoice.due_date) : "—"}</b>
        </div>
        <div className="ux-figure">
          <span>Total</span>
          <b>{ugx(Number(invoice.total))}</b>
        </div>
        <div className="ux-figure">
          <span>{payable ? "Balance due" : "Paid"}</span>
          <b>{ugx(payable ? outstanding : paidTotal)}</b>
        </div>
      </div>

      <Section title="Items">
        <div className="ux-tablewrap">
          <table className="ux-table ux-table--stack">
            <thead>
              <tr>
                <th>Description</th>
                <th className="ux-num">Qty</th>
                <th className="ux-num">Unit price</th>
                <th className="ux-num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item) => (
                <tr key={item.id}>
                  <td data-label="Description">{item.description}</td>
                  <td className="ux-num" data-label="Qty">{Number(item.quantity).toLocaleString()}</td>
                  <td className="ux-num" data-label="Unit price">{ugx(Number(item.unit_price))}</td>
                  <td className="ux-num" data-label="Amount">{ugx(Number(item.amount))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="ux-num">Subtotal</td>
                <td className="ux-num" data-label="Subtotal">{ugx(Number(invoice.subtotal))}</td>
              </tr>
              {invoice.tax_rate > 0 && (
                <tr>
                  <td colSpan={3} className="ux-num">Tax ({invoice.tax_rate}%)</td>
                  <td className="ux-num" data-label="Tax">{ugx(Number(invoice.tax_amount))}</td>
                </tr>
              )}
              <tr>
                <td colSpan={3} className="ux-num"><b>Total</b></td>
                <td className="ux-num" data-label="Total"><b>{ugx(Number(invoice.total))}</b></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Section>

      {payments.length > 0 && (
        <Section title="Payments">
          <div className="ux-tablewrap">
            <table className="ux-table ux-table--stack">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Method</th>
                  <th>Receipt</th>
                  <th className="ux-num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => {
                  const receipt = receiptMap.get(p.id);
                  return (
                    <tr key={p.id}>
                      <td data-label="Date">{p.paid_at ? fmt(p.paid_at) : "—"}</td>
                      <td data-label="Method" style={{ textTransform: "capitalize" }}>{p.method.replace("_", " ")}</td>
                      <td data-label="Receipt">
                        {receipt && (
                          <a href={`/api/receipts/${receipt.id}/pdf`} className="ux-textbtn">
                            Download receipt
                          </a>
                        )}
                      </td>
                      <td className="ux-num" data-label="Amount">{ugx(Number(p.amount))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}
