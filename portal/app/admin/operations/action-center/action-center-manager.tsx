"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, Archive } from "lucide-react";
import { StatusMark, type Tone } from "@/components/ux/primitives";
import { reviewActionItem } from "@/lib/actions/provider-monitoring";

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
  system_name: string | null;
  resource_name: string | null;
  external_name: string | null;
  incident_id: string | null;
  incident_status: string | null;
  detected_at: string;
  resolved_at: string | null;
  resolved_by_name: string | null;
}

interface Props {
  items: ActionItem[];
  canReview: boolean;
  isFinance: boolean;
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

export default function ActionCenterManager({ items, canReview }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  const open = useMemo(() => items.filter((i) => ["open", "acknowledged"].includes(i.status)), [items]);
  const closed = useMemo(() => items.filter((i) => !["open", "acknowledged"].includes(i.status)), [items]);
  const visible = showClosed ? items : open;

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
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <p className="ux-muted">{open.length} open</p>
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
        {visible.length === 0 ? (
          <p className="ux-muted" style={{ padding: "1rem" }}>
            {open.length === 0 && closed.length === 0
              ? "No operational signals."
              : "No open signals — all clear."}
          </p>
        ) : (
          <div className="ux-tablewrap">
            <table className="ux-table">
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
                    <td><StatusMark tone={sevTone(i.severity)}>{i.severity}</StatusMark></td>
                    <td>
                      {i.title}
                      <br />
                      <span className="ux-muted">
                        {i.provider_name}{i.account_name ? ` · ${i.account_name}` : ""}
                        {i.summary ? ` — ${i.summary}` : ""}
                      </span>
                    </td>
                    <td><span className="ux-muted">{i.recommended_action ?? "—"}</span></td>
                    <td>
                      {i.client_company ?? "—"}
                      {i.system_name ? <><br /><span className="ux-muted">{i.system_name}</span></> : null}
                      {i.resource_name || i.external_name ? (
                        <><br /><span className="ux-muted">{i.resource_name ?? i.external_name}</span></>
                      ) : null}
                      {i.incident_id ? (
                        <><br /><a href="/admin/operations/incidents" className="ux-link">Incident ({i.incident_status})</a></>
                      ) : null}
                    </td>
                    <td>{fmt(i.detected_at)}</td>
                    <td><StatusMark tone={statusTone(i.status)}>{i.status}</StatusMark></td>
                    {canReview && (
                      <td>
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
