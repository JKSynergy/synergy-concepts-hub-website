"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import {
  INVOICE_STATUS_BADGE,
  type InvoiceStatus,
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
    try {
      const res = await fetch("/api/paystack/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: invoice.id, amount: invoice.total, email: invoice.client_id }),
      });
      const data = await res.json();
      if (data.authorization_url) {
        window.location.href = data.authorization_url;
      } else {
        setError(data.error || "Payment initialization failed");
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (loading) return <div className="p-8 text-sm text-gray-500">Loading...</div>;
  if (error) return <div className="p-8 text-sm text-red-600">{error}</div>;
  if (!invoice) return <div className="p-8 text-sm text-gray-500">Invoice not found.</div>;

  const receiptMap = new Map(receipts.map((r) => [r.payment_id, r]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{invoice.invoice_number}</h1>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${
              INVOICE_STATUS_BADGE[invoice.status as InvoiceStatus]
            }`}
          >
            {invoice.status}
          </span>
          <a
            href={`/api/invoices/${invoice.id}/pdf`}
            className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
          >
            PDF
          </a>
        </div>
      </div>

      <div className="rounded-xl bg-white p-6 shadow">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <p className="text-sm text-gray-500">Issue Date</p>
            <p className="text-base font-medium text-gray-900">{new Date(invoice.issue_date).toLocaleDateString()}</p>
          </div>
          {invoice.due_date && (
            <div>
              <p className="text-sm text-gray-500">Due Date</p>
              <p className="text-base font-medium text-gray-900">{new Date(invoice.due_date).toLocaleDateString()}</p>
            </div>
          )}
        </div>

        <table className="mt-6 min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Description</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Qty</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Unit Price</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {lineItems.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-2 text-sm text-gray-900">{item.description}</td>
                <td className="px-4 py-2 text-right text-sm text-gray-500">{Number(item.quantity).toLocaleString()}</td>
                <td className="px-4 py-2 text-right text-sm text-gray-500">UGX {Number(item.unit_price).toLocaleString()}</td>
                <td className="px-4 py-2 text-right text-sm text-gray-900">UGX {Number(item.amount).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 flex justify-end">
          <div className="w-64 space-y-2 text-right">
            <div className="flex justify-between text-sm text-gray-500">
              <span>Subtotal</span>
              <span>UGX {Number(invoice.subtotal).toLocaleString()}</span>
            </div>
            {invoice.tax_rate > 0 && (
              <div className="flex justify-between text-sm text-gray-500">
                <span>Tax ({invoice.tax_rate}%)</span>
                <span>UGX {Number(invoice.tax_amount).toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-gray-900">
              <span>Total</span>
              <span>UGX {Number(invoice.total).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {invoice.status !== "paid" && invoice.status !== "cancelled" && (
        <div className="rounded-xl bg-white p-6 shadow">
          <h2 className="text-lg font-semibold text-gray-900">Pay Online</h2>
          <p className="mt-1 text-sm text-gray-500">Secure payment via Paystack (cards + mobile money).</p>
          <button
            onClick={handlePaystack}
            className="mt-4 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500"
          >
            Pay UGX {Number(invoice.total).toLocaleString()} with Paystack
          </button>
        </div>
      )}

      {payments.length > 0 && (
        <div className="rounded-xl bg-white p-6 shadow">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Payments</h2>
          <table className="mt-3 min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Date</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Method</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Amount</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {payments.map((p) => {
                const receipt = receiptMap.get(p.id);
                return (
                  <tr key={p.id}>
                    <td className="px-4 py-2 text-sm text-gray-500">
                      {p.paid_at ? new Date(p.paid_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-500 capitalize">{p.method.replace("_", " ")}</td>
                    <td className="px-4 py-2 text-right text-sm font-medium text-gray-900">
                      UGX {Number(p.amount).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {receipt && (
                        <a
                          href={`/api/receipts/${receipt.id}/pdf`}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Receipt
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
