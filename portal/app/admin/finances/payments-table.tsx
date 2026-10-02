"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { EmptyState, ugx } from "@/components/ux/primitives";
import { fmtDate, methodLabel } from "../invoices/fin-utils";

export type PaymentRow = {
  id: string;
  date: string;
  invoice_id: string;
  invoice_number: string | null;
  client_name: string;
  method: string;
  reference: string | null;
  amount: number;
  receipt_id: string | null;
};

export default function PaymentsTable({ rows }: { rows: PaymentRow[] }) {
  const [q, setQ] = useState("");
  const [method, setMethod] = useState("all");

  const methods = useMemo(() => [...new Set(rows.map((r) => r.method))], [rows]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (method !== "all" && r.method !== method) return false;
      if (!term) return true;
      return (
        (r.invoice_number ?? "").toLowerCase().includes(term) ||
        r.client_name.toLowerCase().includes(term) ||
        (r.reference ?? "").toLowerCase().includes(term)
      );
    });
  }, [rows, q, method]);

  const collected = filtered.reduce((s, r) => s + r.amount, 0);
  const isFiltered = filtered.length !== rows.length;

  return (
    <>
      {rows.length > 0 && (
        <div className="ux-figures" style={{ marginBottom: 28 }}>
          <div className="ux-figure">
            <span>{isFiltered ? "Collected (filtered)" : "Collected"}</span>
            <b>{ugx(collected)}</b>
            <small className="ux-cell-sub">Sum of the payments listed below</small>
          </div>
          <div className="ux-figure">
            <span>Payments</span>
            <b>{filtered.length}</b>
            <small className="ux-cell-sub">{isFiltered ? `of ${rows.length} recorded` : "recorded in total"}</small>
          </div>
        </div>
      )}

      <div className="ux-toolbar">
        <div className="ux-filters" style={{ flex: 1 }}>
          <input
            type="search"
            className="ux-input ux-search"
            placeholder="Search invoice, client or reference"
            aria-label="Search invoice, client or reference"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select className="ux-input ux-select" aria-label="Filter by method" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="all">All methods</option>
            {methods.map((m) => (
              <option key={m} value={m}>
                {methodLabel(m)}
              </option>
            ))}
          </select>
        </div>
        <span className="ux-muted" style={{ fontSize: 13 }}>
          {filtered.length === rows.length
            ? `${rows.length} payment${rows.length === 1 ? "" : "s"}`
            : `${filtered.length} of ${rows.length} payment${rows.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No payments recorded">Recorded payments will appear here.</EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState title="No matching payments">Change the search or the method filter.</EmptyState>
      ) : (
        <div className="ux-tablewrap">
          <table className="ux-table ux-table--stack ux-fin-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Invoice</th>
                <th>Client</th>
                <th>Method</th>
                <th>Reference</th>
                <th className="ux-num">Amount</th>
                <th>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.date)}</td>
                  <td data-label="Invoice">
                    <Link href={`/admin/invoices/${r.invoice_id}`} className="ux-cell-main">
                      {r.invoice_number ?? "—"}
                    </Link>
                  </td>
                  <td data-label="Client">{r.client_name}</td>
                  <td data-label="Method">{methodLabel(r.method)}</td>
                  <td data-label="Reference" className="ux-muted">{r.reference ?? "—"}</td>
                  <td className="ux-num" data-label="Amount">{ugx(r.amount)}</td>
                  <td data-label="Receipt">
                    {r.receipt_id ? (
                      <a href={`/api/receipts/${r.receipt_id}/pdf`} className="ux-link">
                        Download
                      </a>
                    ) : (
                      <span className="ux-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
