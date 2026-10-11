"use client";

import { useMemo, useState } from "react";
import { NavLink as Link } from "@/components/nav-link";
import BookingActions from "./booking-actions";
import { EmptyState, StatusMark } from "@/components/ux/primitives";
import { BOOKING_TONE, BOOKING_TYPE_TEXT, bookingTypeText, fmtDateTime } from "./booking-labels";
import type { BookingStatus } from "@/lib/types";

export type BookingRow = {
  id: string;
  title: string;
  type: string;
  status: string;
  scheduled_at: string | null;
  created_at: string;
  requester: string;
  requester_email: string | null;
  linked: boolean;
};

const STATUSES = ["pending", "confirmed", "completed", "cancelled"];

export default function BookingsTable({ rows, canDelete = false }: { rows: BookingRow[]; canDelete?: boolean }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("open");
  const [type, setType] = useState("all");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status === "open" && r.status !== "pending" && r.status !== "confirmed") return false;
      if (status !== "open" && status !== "all" && r.status !== status) return false;
      if (type !== "all" && r.type !== type) return false;
      if (!term) return true;
      return [r.title, r.requester, r.requester_email].some((v) => v?.toLowerCase().includes(term));
    });
  }, [rows, q, status, type]);

  return (
    <>
      <div className="ux-toolbar">
        <div className="ux-filters" style={{ flex: 1 }}>
          <input
            type="search"
            className="ux-input ux-search"
            placeholder="Search requests or requesters"
            aria-label="Search booking requests"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="ux-input ux-select"
            aria-label="Filter by status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="open">Open (pending and confirmed)</option>
            <option value="all">All requests</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
          <select
            className="ux-input ux-select"
            aria-label="Filter by type"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="all">All types</option>
            {Object.entries(BOOKING_TYPE_TEXT).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <span className="ux-muted" style={{ fontSize: 13 }}>
          {filtered.length === rows.length
            ? `${rows.length} booking request${rows.length === 1 ? "" : "s"}`
            : `${filtered.length} of ${rows.length} booking request${rows.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No booking requests yet">Client requests and bookings you add on their behalf will appear here.</EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState title="No matching requests">No booking requests match the current search or filters.</EmptyState>
      ) : (
        <div className="ux-tablewrap ux-bookings">
          <table className="ux-table ux-table--stack">
            <thead>
              <tr>
                <th>Request</th>
                <th>Requester</th>
                <th>Scheduled</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <tr key={b.id}>
                  <td>
                    <Link href={`/admin/bookings/${b.id}`} className="ux-cell-main">
                      {b.title}
                    </Link>
                    <span className="ux-cell-sub">{bookingTypeText(b.type)}</span>
                  </td>
                  <td data-label="Requester">
                    {b.requester}
                    {b.requester_email && b.requester_email !== b.requester && (
                      <span className="ux-cell-sub">{b.requester_email}</span>
                    )}
                  </td>
                  <td data-label="Scheduled" className="ux-muted">
                    {b.scheduled_at ? fmtDateTime(b.scheduled_at) : "Not scheduled"}
                  </td>
                  <td data-label="Status">
                    <StatusMark tone={BOOKING_TONE[b.status] ?? "neutral"}>{b.status}</StatusMark>
                  </td>
                  <td>
                    <BookingActions
                      bookingId={b.id}
                      status={b.status as BookingStatus}
                      title={b.title}
                      requester={b.requester}
                      scheduledAt={b.scheduled_at}
                      canDelete={canDelete}
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
