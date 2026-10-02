"use client";

import { useMemo, useState } from "react";
import LeadActions from "./lead-actions";
import { EmptyState, StatusMark, type Tone } from "@/components/ux/primitives";
import type { Lead } from "@/lib/types";

export const LEAD_TONE: Record<string, Tone> = {
  new: "warning",
  contacted: "info",
  converted: "success",
  archived: "neutral",
};

const STATUSES = ["new", "contacted", "converted", "archived"];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function excerpt(s: string, n = 110) {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > n ? flat.slice(0, n).trimEnd() + "…" : flat;
}

export default function LeadsTable({ rows }: { rows: Lead[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("open");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status === "open" && r.status !== "new" && r.status !== "contacted") return false;
      if (status !== "open" && status !== "all" && r.status !== status) return false;
      if (!term) return true;
      return [r.name, r.email, r.phone, r.service_interest, r.message].some((v) => v?.toLowerCase().includes(term));
    });
  }, [rows, q, status]);

  return (
    <>
      <div className="ux-toolbar">
        <div className="ux-filters" style={{ flex: 1 }}>
          <input
            type="search"
            className="ux-input ux-search"
            placeholder="Search name, email, service or message"
            aria-label="Search enquiries"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="ux-input ux-select"
            aria-label="Filter by status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="open">Open (new and contacted)</option>
            <option value="all">All enquiries</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <span className="ux-muted" style={{ fontSize: 13 }}>
          {filtered.length === rows.length
            ? `${rows.length} ${rows.length === 1 ? "enquiry" : "enquiries"}`
            : `${filtered.length} of ${rows.length} ${rows.length === 1 ? "enquiry" : "enquiries"}`}
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No enquiries yet">
          Website enquiries will appear here when someone submits a form.
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState title="No enquiries match your search">Change the search or the status filter.</EmptyState>
      ) : (
        <div className="ux-tablewrap">
          <table className="ux-table ux-table--stack ux-enquiries">
            <thead>
              <tr>
                <th>Enquirer</th>
                <th>Service interest</th>
                <th>Message</th>
                <th>Received</th>
                <th>Status</th>
                <th>Next action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id}>
                  <td>
                    <span className="ux-cell-main">{l.name}</span>
                    <span className="ux-cell-sub">{l.email}</span>
                    {l.phone && <span className="ux-cell-sub">{l.phone}</span>}
                  </td>
                  <td data-label="Service interest">{l.service_interest || <span className="ux-muted">Not specified</span>}</td>
                  <td data-label="Message" className="ux-lead-msg" title={l.message ?? undefined}>
                    {l.message ? excerpt(l.message) : <span className="ux-muted">No message</span>}
                  </td>
                  <td data-label="Received" className="ux-muted">{fmtDate(l.created_at)}</td>
                  <td data-label="Status">
                    <StatusMark tone={LEAD_TONE[l.status] ?? "neutral"}>{l.status}</StatusMark>
                  </td>
                  <td data-label="Next action">
                    <LeadActions leadId={l.id} status={l.status} name={l.name} email={l.email} />
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
