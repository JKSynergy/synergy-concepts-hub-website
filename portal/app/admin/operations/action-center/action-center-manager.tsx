"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Eye, Archive } from "lucide-react";
import { StatusMark, type Tone } from "@/components/ux/primitives";
import { reviewActionItem } from "@/lib/actions/provider-monitoring";
import {
  sortActionItems,
  filterActionItems,
  isActionableSignal,
} from "@/lib/operations/action-center";

export interface ActionItem {
  id: string;
  source: string;
  event_type: string;
  severity: string;
  title: string;
  summary: string | null;
  recommended_action: string | null;
  status: string;
  provider_name: string | null;
  account_name: string | null;
  client_company: string | null;
  system_id: string | null;
  system_name: string | null;
  resource_name: string | null;
  external_name: string | null;
  incident_id: string | null;
  incident_status: string | null;
  monitoring_run_id: string | null;
  detected_at: string;
  occurrence_count: number | null;
  last_observed_at: string | null;
  acknowledged_by_name: string | null;
  resolved_at: string | null;
  resolved_by_name: string | null;
}

interface Props {
  items: ActionItem[];
  /** True when the feed query failed — render Unavailable, never a false clear queue. */
  itemsUnavailable: boolean;
  canReview: boolean;
  isFinance: boolean;
  /** Admin/finance may follow links into provider monitoring views staff can't read. */
  canSeeProviderData: boolean;
}

function fmt(ts: string | null): string {
  return ts ? new Date(ts).toLocaleString() : "—";
}

function sevTone(s: string): Tone {
  switch (s) {
    case "critical": return "danger";
    case "warning": return "warning";
    default: return "info";
  }
}

function statusTone(s: string): Tone {
  switch (s) {
    case "open": return "warning";
    case "acknowledged": return "info";
    case "resolved": return "success";
    default: return "neutral";
  }
}

export default function ActionCenterManager({
  items,
  itemsUnavailable,
  canReview,
  canSeeProviderData,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [severityFilter, setSeverityFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");

  const sources = useMemo(
    () => [...new Set(items.map((i) => i.source))].sort(),
    [items]
  );
  // Actionable first by severity then age; terminal signals last. Same
  // actionable definition (open + acknowledged) as the Operations Overview.
  const sorted = useMemo(() => sortActionItems(items), [items]);
  const open = useMemo(() => sorted.filter(isActionableSignal), [sorted]);
  const closed = useMemo(() => sorted.filter((i) => !isActionableSignal(i)), [sorted]);
  const visible = useMemo(
    () => filterActionItems(showClosed ? sorted : open, { severity: severityFilter, source: sourceFilter }),
    [showClosed, sorted, open, severityFilter, sourceFilter]
  );

  async function act(itemId: string, decision: "acknowledge" | "resolve" | "dismiss") {
    setBusy(true);
    setErrorMessage(null);
    const res = await reviewActionItem(itemId, decision);
    setBusy(false);
    if (!res.ok) setErrorMessage(res.error || "Action failed");
    router.refresh();
  }

  return (
    <div>
      {errorMessage && <p className="ux-alert ux-alert-error" role="alert">{errorMessage}</p>}

      <div className="ux-card">
        <div className="ux-card-header">
          <h2>Signals</h2>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
            <p className="ux-muted">
              {itemsUnavailable ? "—" : `${open.length} actionable`}
            </p>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="ux-select"
              style={{ fontSize: "0.8125rem", padding: "0.25rem 0.5rem" }}
            >
              <option value="all">All severities</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="ux-select"
              style={{ fontSize: "0.8125rem", padding: "0.25rem 0.5rem" }}
            >
              <option value="all">All sources</option>
              {sources.map((s) => (
                <option key={s} value={s}>{s.replaceAll("_", " ")}</option>
              ))}
            </select>
            <label style={{ display: "flex", gap: "0.35rem", alignItems: "center" }} className="ux-muted">
              <input
                type="checkbox"
                data-action="show-closed"
                checked={showClosed}
                onChange={(e) => setShowClosed(e.target.checked)}
              />
              Show resolved
            </label>
          </div>
        </div>
        {itemsUnavailable ? (
          <p className="ux-muted" style={{ padding: "1rem" }}>
            Unavailable — the signal feed could not be loaded. A failed query is not the same as
            no signals.{" "}
            <button type="button" onClick={() => router.refresh()} className="ux-link">Retry</button>
          </p>
        ) : visible.length === 0 ? (
          <p className="ux-muted" style={{ padding: "1rem" }}>
            {open.length === 0 && closed.length === 0
              ? "No operational signals."
              : "No open signals — all clear."}
          </p>
        ) : (
          <div className="ux-tablewrap">
            <table className="ux-table ux-table--stack ops-stack">
              <thead>
                <tr>
                  <th>Severity</th><th>Signal</th><th>Recommended action</th>
                  <th>Client / system / resource</th><th>Detected</th><th>Status</th>
                  {canReview && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {visible.map((i) => (
                  <tr key={i.id} data-item={i.id}>
                    <td data-label="Severity"><StatusMark tone={sevTone(i.severity)}>{i.severity}</StatusMark></td>
                    <td data-label="Signal" className="ops-stack-lead">
                      {i.title}
                      <br />
                      <span className="ux-muted">
                        {i.provider_name}{i.account_name ? ` · ${i.account_name}` : ""}
                        {i.summary ? ` — ${i.summary}` : ""}
                      </span>
                      {(i.occurrence_count ?? 1) > 1 && (
                        <>
                          <br />
                          <span className="ux-muted">Observed {i.occurrence_count}× — latest {fmt(i.last_observed_at)}</span>
                        </>
                      )}
                      {i.status === "acknowledged" && i.acknowledged_by_name && (
                        <>
                          <br />
                          <span className="ux-muted">Acknowledged by {i.acknowledged_by_name}</span>
                        </>
                      )}
                    </td>
                    <td data-label="Recommended action"><span className="ux-muted">{i.recommended_action ?? "—"}</span></td>
                    <td data-label="Client / system">
                      {i.client_company ?? "—"}
                      {i.system_name ? (
                        <>
                          <br />
                          {i.system_id ? (
                            <Link href={`/admin/systems/${i.system_id}`} className="ux-link">{i.system_name}</Link>
                          ) : (
                            <span className="ux-muted">{i.system_name}</span>
                          )}
                        </>
                      ) : null}
                      {i.resource_name || i.external_name ? (
                        <><br /><span className="ux-muted">{i.resource_name ?? i.external_name}</span></>
                      ) : null}
                      {i.incident_id ? (
                        <><br /><Link href="/admin/operations/incidents" className="ux-link">Incident ({i.incident_status})</Link></>
                      ) : null}
                      {i.monitoring_run_id && canSeeProviderData ? (
                        <><br /><Link href="/admin/systems/monitoring" className="ux-link">Monitoring run</Link></>
                      ) : null}
                    </td>
                    <td data-label="Detected">{fmt(i.detected_at)}</td>
                    <td data-label="Status"><StatusMark tone={statusTone(i.status)}>{i.status}</StatusMark></td>
                    {canReview && (
                      <td className="ops-stack-actions">
                        {["open", "acknowledged"].includes(i.status) && (
                          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                            {i.status === "open" && (
                              <button className="ux-button ux-button-secondary" data-action="acknowledge"
                                disabled={busy} onClick={() => act(i.id, "acknowledge")}>
                                <Eye size={13} /> Acknowledge
                              </button>
                            )}
                            <button className="ux-button ux-button-secondary" data-action="resolve"
                              disabled={busy} onClick={() => act(i.id, "resolve")}>
                              <Check size={13} /> Resolve
                            </button>
                            <button className="ux-button ux-button-secondary" data-action="dismiss"
                              disabled={busy} onClick={() => act(i.id, "dismiss")}>
                              <Archive size={13} /> Dismiss
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
