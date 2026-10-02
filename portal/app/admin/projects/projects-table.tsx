"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { EmptyState, StatusMark, PROJECT_TONE } from "@/components/ux/primitives";
import NewProjectForm from "./new-project-form";

export type ProjectRow = {
  id: string;
  title: string;
  status: string;
  progress_percent: number | null;
  target_date: string | null;
  client_name: string;
};

const STATUS_ORDER = ["active", "review", "quoted", "lead", "completed", "archived"];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function ProjectsTable({
  rows,
  canCreate = false,
  clients = [],
}: {
  rows: ProjectRow[];
  canCreate?: boolean;
  clients?: { id: string; label: string }[];
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("open");
  const today = new Date().toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status === "open" && (r.status === "completed" || r.status === "archived")) return false;
      if (status !== "open" && status !== "all" && r.status !== status) return false;
      if (!term) return true;
      return r.title.toLowerCase().includes(term) || r.client_name.toLowerCase().includes(term);
    });
  }, [rows, q, status]);

  const present = STATUS_ORDER.filter((s) => rows.some((r) => r.status === s));

  return (
    <>
      <div className="ux-toolbar">
        <div className="ux-filters" style={{ flex: 1 }}>
          <input
            type="search"
            className="ux-input ux-search"
            placeholder="Search projects or clients"
            aria-label="Search projects or clients"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="ux-input ux-select"
            aria-label="Filter by status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={{ textTransform: "capitalize" }}
          >
            <option value="open">Open work</option>
            <option value="all">All projects</option>
            {present.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <span className="ux-muted" style={{ fontSize: 13 }}>
          {filtered.length === rows.length
            ? `${rows.length} project${rows.length === 1 ? "" : "s"}`
            : `${filtered.length} of ${rows.length} project${rows.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No projects yet"
          action={canCreate ? <NewProjectForm clients={clients} /> : undefined}
        >
          Create a project to start tracking work from quote through delivery.
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState title="No matching projects">Change the search or the status filter.</EmptyState>
      ) : (
        <div className="ux-tablewrap">
          <table className="ux-table ux-table--stack ux-projects">
            <thead>
              <tr>
                <th>Project</th>
                <th>Client</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Target</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const late = p.target_date && p.target_date < today && p.status !== "completed" && p.status !== "archived";
                return (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/admin/projects/${p.id}`} className="ux-cell-main">
                        {p.title}
                      </Link>
                    </td>
                    <td data-label="Client">{p.client_name}</td>
                    <td data-label="Status">
                      <StatusMark tone={PROJECT_TONE[p.status] ?? "neutral"}>{p.status}</StatusMark>
                    </td>
                    <td data-label="Progress">
                      <div className="ux-progress-cell">
                        <div
                          className="ux-progress"
                          role="progressbar"
                          aria-valuenow={p.progress_percent ?? 0}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          {...((p.progress_percent ?? 0) >= 100 ? { "data-complete": "" } : {})}
                        >
                          <i style={{ width: `${p.progress_percent ?? 0}%` }} />
                        </div>
                        <span>{p.progress_percent ?? 0}%</span>
                      </div>
                    </td>
                    <td data-label="Target" className={late ? "ux-late" : "ux-muted"}>
                      {p.target_date ? fmtDate(p.target_date) : "—"}
                      {late && <span className="ux-cell-sub ux-late">Past target date</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
