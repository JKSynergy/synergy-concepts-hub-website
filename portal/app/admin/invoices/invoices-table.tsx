"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { EmptyState, StatusMark, INVOICE_TONE, ugx } from "@/components/ux/primitives";
import { InvoiceActions } from "@/components/invoice-actions";
import { fmtDate } from "./fin-utils";

export type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  status: string;
  total: number;
  issue_date: string;
  due_date: string | null;
  client_name: string;
  balance: number | null;
  pastDue: boolean;
  hasPayments: boolean;
};

const STATUS_ORDER = ["draft", "sent", "partially paid", "overdue", "paid", "cancelled"];
const OPEN_VIEW = ["draft", "sent", "partially paid", "overdue"];

export default function InvoicesTable({ rows, canDeleteDrafts = false }: { rows: InvoiceRow[]; canDeleteDrafts?: boolean }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("open");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status === "open" && !OPEN_VIEW.includes(r.status)) return false;
      if (status !== "open" && status !== "all" && r.status !== status) return false;
      if (!term) return true;
      return (r.invoice_number ?? "").toLowerCase().includes(term) || r.client_name.toLowerCase().includes(term);
    });
  }, [rows, q, status]);

  return (
    <>
      <div className="ux-toolbar">
        <div className="ux-filters" style={{ flex: 1 }}>
          <input
            type="search"
            className="ux-input ux-search"
            placeholder="Search invoice number or client"
            aria-label="Search invoice number or client"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="ux-input ux-select"
            aria-label="Filter by status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="open">Open invoices</option>
            <option value="all">All invoices</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {s === "partially paid" ? "Partially paid" : s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <span className="ux-muted" style={{ fontSize: 13 }}>
          {filtered.length === rows.length
            ? `${rows.length} invoice${rows.length === 1 ? "" : "s"}`
            : `${filtered.length} of ${rows.length} invoice${rows.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No invoices yet"
          action={
            <Link href="/admin/invoices/new" className="ux-btn ux-btn--primary">
              New invoice
            </Link>
          }
        >
          Create an invoice to begin tracking billing.
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState title="No matching invoices">Change the search or the status filter.</EmptyState>
      ) : (
        <div className="ux-tablewrap">
          <table className="ux-table ux-table--stack ux-fin-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Client</th>
                <th>Status</th>
                <th>Due</th>
                <th className="ux-num">Total</th>
                <th className="ux-num">Balance</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/admin/invoices/${r.id}`} className="ux-cell-main">
                      {r.invoice_number ?? "—"}
                    </Link>
                    <span className="ux-cell-sub">Issued {fmtDate(r.issue_date)}</span>
                  </td>
                  <td data-label="Client">{r.client_name}</td>
                  <td data-label="Status">
                    <StatusMark tone={INVOICE_TONE[r.status] ?? "neutral"}>{r.status}</StatusMark>
                  </td>
                  <td data-label="Due" className={r.pastDue ? "ux-late" : "ux-muted"}>
                    {fmtDate(r.due_date)}
                    {r.pastDue && r.due_date && <span className="ux-cell-sub ux-late">Past due</span>}
                  </td>
                  <td className="ux-num" data-label="Total">
                    {ugx(r.total)}
                  </td>
                  <td className="ux-num" data-label="Balance">
                    {r.balance === null ? <span className="ux-muted">—</span> : ugx(r.balance)}
                  </td>
                  <td>
                    <InvoiceActions
                      invoiceId={r.id}
                      showOpen
                      canDelete={canDeleteDrafts && r.status === "draft" && !r.hasPayments}
                    />
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
