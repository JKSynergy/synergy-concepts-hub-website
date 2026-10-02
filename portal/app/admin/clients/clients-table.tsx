"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import ClientActions from "./client-actions";
import InviteForm from "./invite-form";
import AddClientForm from "./add-client-form";
import { EmptyState, ugx } from "@/components/ux/primitives";

export type ClientRow = {
  id: string;
  email: string;
  full_name: string | null;
  company_name: string | null;
  phone: string | null;
  billing_address: string | null;
  tax_id: string | null;
  external_portal_url: string | null;
  created_at: string;
  active_work: number;
  outstanding: number | null;
  last_activity: string;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function ClientsTable({ rows, showFinancial, readOnly = false }: { rows: ClientRow[]; showFinancial: boolean; readOnly?: boolean }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) =>
      [r.company_name, r.full_name, r.email, r.phone].some((v) => v?.toLowerCase().includes(term))
    );
  }, [rows, q]);

  return (
    <>
      <div className="ux-toolbar">
        <input
          type="search"
          className="ux-input ux-search"
          placeholder="Search clients"
          aria-label="Search clients"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="ux-muted" style={{ fontSize: 13 }}>
          {q.trim()
            ? `${filtered.length} of ${rows.length} client${rows.length === 1 ? "" : "s"}`
            : `${rows.length} client${rows.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No clients yet."
          action={
            !readOnly ? (
              <div className="ux-rowactions" style={{ gap: 10 }}>
                <AddClientForm />
                <InviteForm />
              </div>
            ) : undefined
          }
        >
          Add your first client or invite someone to access the portal.
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState title="No matches">Nothing matches “{q}”. Try a name, company or email.</EmptyState>
      ) : (
        <div className="ux-tablewrap">
          <table className="ux-table ux-table--stack ux-clients">
            <thead>
              <tr>
                <th>Client</th>
                <th>Contact</th>
                <th>Active work</th>
                {showFinancial && <th className="ux-num">Outstanding</th>}
                <th>Last activity</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/admin/clients/${c.id}`} className="ux-cell-main">
                      {c.company_name || c.full_name || c.email}
                    </Link>
                    {c.company_name && c.full_name && <span className="ux-cell-sub">{c.full_name}</span>}
                  </td>
                  <td data-label="Contact">
                    {c.email || c.phone ? (
                      <>
                        {c.email}
                        {c.phone && <span className="ux-cell-sub">{c.phone}</span>}
                      </>
                    ) : (
                      <span className="ux-muted">No contact</span>
                    )}
                  </td>
                  <td data-label="Active work">
                    {c.active_work > 0 ? (
                      `${c.active_work} ${c.active_work === 1 ? "project" : "projects"}`
                    ) : (
                      <span className="ux-muted">None</span>
                    )}
                  </td>
                  {showFinancial && (
                    <td className="ux-num" data-label="Outstanding">
                      {c.outstanding ? ugx(c.outstanding) : <span className="ux-muted">—</span>}
                    </td>
                  )}
                  <td data-label="Last activity" className="ux-muted">{fmtDate(c.last_activity)}</td>
                  <td>
                    {readOnly ? (
                      <div className="ux-rowactions">
                        <Link href={`/admin/clients/${c.id}`} className="ux-textbtn ux-textbtn--strong">
                          Open
                        </Link>
                      </div>
                    ) : (
                      <ClientActions client={c} />
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
