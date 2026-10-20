"use client";

// "Due to invoice": every agreement period that is ready to bill, with a
// one-step Preview → Send. Shown on the Invoices page.

import { useState } from "react";
import Link from "next/link";
import { formatMoney } from "@/components/billing/breakdown-editor";
import { BillingPreviewDialog, type PreviewTarget } from "@/components/billing/billing-preview";
import { fmtDay } from "@/lib/billing/periods";

export type DueRow = PreviewTarget & { invoiceDate: string; state: "due" | "upcoming" };

export function DueList({ rows }: { rows: DueRow[] }) {
  const [preview, setPreview] = useState<PreviewTarget | null>(null);
  const due = rows.filter((r) => r.state === "due");
  const soon = rows.filter((r) => r.state === "upcoming");
  if (!rows.length) return null;
  return (
    <section className="due" aria-labelledby="due-title">
      <div className="due-head">
        <h2 id="due-title">
          Due to invoice <span className="due-count">{due.length}</span>
        </h2>
        <span className="bl-meta">From active agreements · each period is billed once</span>
      </div>
      <ul className="due-list">
        {[...due, ...soon].map((r) => (
          <li key={`${r.chargeId}-${r.periodStart}`} className={r.state === "due" ? "is-due" : "is-soon"}>
            <span className="due-main">
              <b>{r.clientName}</b>
              <Link href={`/admin/agreements/${r.agreementId}?tab=billing`} className="due-agr">
                {r.agreementName}
              </Link>
            </span>
            <span className="due-period">
              {r.periodLabel}
              <small>{r.state === "due" ? `ready since ${fmtDay(r.invoiceDate)}` : `invoice on ${fmtDay(r.invoiceDate)}`}</small>
            </span>
            <span className="due-amt">{formatMoney(r.amount, r.currency)}</span>
            <span className="due-act">
              <button
                type="button"
                className={`ux-btn ux-btn--small ${r.state === "due" ? "ux-btn--primary" : "ux-btn--secondary"}`}
                onClick={() => setPreview(r)}
              >
                {r.state === "due" ? "Preview & send" : "Preview"}
              </button>
            </span>
          </li>
        ))}
      </ul>
      {preview && <BillingPreviewDialog target={preview} onClose={() => setPreview(null)} />}
    </section>
  );
}
