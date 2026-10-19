"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { GitCompareArrows, Check, X, EyeOff, ThumbsUp, Play, RefreshCw } from "lucide-react";
import { Dialog } from "@/components/ux/dialog";
import { StatusMark, type Tone } from "@/components/ux/primitives";
import {
  runProviderReconciliation,
  reviewReconciliationItem,
  applyReconciliationItem,
  type ReviewDecision,
} from "@/lib/actions/provider-reconciliation";
import { sortReconItemsForAttention } from "@/lib/operations/action-center";

export interface ReconItem {
  id: string;
  run_id: string;
  provider_account_id: string;
  discovered_resource_id: string | null;
  resource_id: string | null;
  provider_name: string | null;
  account_name: string | null;
  external_resource_id: string | null;
  external_type: string | null;
  external_name: string | null;
  sch_resource_name: string | null;
  sch_status: string | null;
  system_name: string | null;
  client_company: string | null;
  client_email: string | null;
  change_type: string;
  change_summary: string | null;
  previous_snapshot: Record<string, unknown> | null;
  current_snapshot: Record<string, unknown> | null;
  requires_review: boolean;
  review_status: string;
  reviewed_at: string | null;
  applied_at: string | null;
  basis_run_id: string | null;
  basis_stale: boolean | null;
  run_status: string;
  created_at: string;
}

export interface ReconRun {
  id: string;
  provider_account_id: string;
  status: string;
  resources_examined: number;
  changes_detected: number;
  error_count: number;
  error_summary: string | null;
  started_at: string;
  completed_at: string | null;
}

interface Props {
  items: ReconItem[];
  runs: ReconRun[];
  accounts: { id: string; provider_name: string | null; account_name: string }[];
  isAdmin: boolean;
  isFinance: boolean;
  /** True when a section's query failed — render Unavailable, never a false empty list. */
  itemsUnavailable: boolean;
  runsUnavailable: boolean;
  accountsUnavailable: boolean;
}

const CHANGE_LABELS: Record<string, string> = {
  new_external_resource: "New external resource",
  unchanged: "Unchanged",
  external_change: "External change",
  missing_externally: "Missing externally",
  identity_change: "Identity change",
  sch_only: "SCH only",
};

const APPLIABLE_TYPES = new Set(["external_change", "identity_change", "missing_externally"]);

function changeTone(t: string): Tone {
  switch (t) {
    case "unchanged": return "neutral";
    case "external_change": return "warning";
    case "missing_externally": return "danger";
    case "identity_change": return "danger";
    case "new_external_resource": return "info";
    case "sch_only": return "warning";
    default: return "neutral";
  }
}

function statusTone(s: string): Tone {
  switch (s) {
    case "applied": return "success";
    case "approved": return "info";
    case "acknowledged": return "info";
    case "rejected": case "dismissed": case "stale": return "neutral";
    case "pending_review": return "warning";
    default: return "neutral";
  }
}

function fmt(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  // Deterministic UTC text (same on server and client), matching Operations and Systems.
  return Number.isNaN(d.getTime()) ? "—" : `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function snapshotField(s: Record<string, unknown> | null, key: string): string {
  const v = s?.[key];
  return v == null ? "—" : String(v);
}

export default function ReconciliationManager({
  items,
  runs,
  accounts,
  isAdmin,
  itemsUnavailable,
  runsUnavailable,
  accountsUnavailable,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [detailFor, setDetailFor] = useState<ReconItem | null>(null);
  const [reconAccount, setReconAccount] = useState("");

  // Pending review decisions lead the list, oldest first — display ordering
  // only; review/apply transitions are enforced by the reconciliation RPCs.
  const actionable = useMemo(
    () => sortReconItemsForAttention(items.filter((i) => i.review_status !== "not_required")),
    [items]
  );
  const pending = actionable.filter((i) => ["pending_review", "acknowledged", "approved"].includes(i.review_status));

  async function run(fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, okMsg?: string) {
    setBusy(true);
    setErrorMessage(null);
    setNotice(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) setErrorMessage(res.error || "Operation failed");
    else if (okMsg) setNotice(okMsg);
    router.refresh();
    return res;
  }

  async function onReconcile() {
    if (!reconAccount) return;
    const res = await run(() => runProviderReconciliation(reconAccount));
    if (res.ok) {
      const d = res.data as { examined: number; changes: number };
      setNotice(`Reconciliation completed — ${d.examined} examined, ${d.changes} change(s) detected`);
    }
  }

  async function onReview(id: string, decision: ReviewDecision, msg: string) {
    await run(() => reviewReconciliationItem(id, decision), msg);
  }

  const target = detailFor;

  return (
    <div>
      {errorMessage && <p className="ux-alert ux-alert-error" role="alert">{errorMessage}</p>}
      {notice && <p className="ux-alert ux-alert-success" role="status">{notice}</p>}

      {isAdmin && (
        <div className="ux-card" style={{ marginBottom: "1rem" }}>
          <div className="ux-card-header"><h2>Run reconciliation</h2></div>
          <div style={{ display: "flex", gap: "0.5rem", padding: "0 1rem 1rem", alignItems: "center", flexWrap: "wrap" }}>
            <select
              id="select-recon-account"
              className="ux-select"
              style={{ flex: "1 1 240px", maxWidth: "100%" }}
              value={reconAccount}
              onChange={(e) => setReconAccount(e.target.value)}
            >
              <option value="">Select provider account...</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.provider_name} — {a.account_name}</option>
              ))}
            </select>
            <button className="ux-button" data-action="reconcile" disabled={busy || !reconAccount} onClick={onReconcile}>
              <RefreshCw size={14} /> Reconcile
            </button>
            <span className="ux-muted">
              Manual only — reconciliation never runs on a schedule.
              {accountsUnavailable && (
                <><br /><span style={{ color: "var(--ux-danger)" }}>Provider accounts unavailable — retry to run reconciliation.</span></>
              )}
            </span>
          </div>
        </div>
      )}

      <div className="ux-card">
        <div className="ux-card-header">
          <h2>Reconciliation items</h2>
          <p className="ux-muted">{itemsUnavailable ? "—" : `${pending.length} awaiting review`}</p>
        </div>
        {itemsUnavailable ? (
          <p className="ux-muted" style={{ padding: "1rem" }}>
            Unavailable — reconciliation findings could not be loaded. A failed query is not the same as no findings.{" "}
            <button type="button" onClick={() => router.refresh()} className="ux-link">Retry</button>
          </p>
        ) : actionable.length === 0 ? (
          <p className="ux-muted" style={{ padding: "1rem" }}>No reconciliation findings yet.</p>
        ) : (
          <div className="ux-tablewrap">
            <table className="ux-table ux-table--stack ux-table--cards">
              <thead>
                <tr>
                  <th>Provider</th><th>Account</th><th>External resource</th><th>SCH resource</th>
                  <th>Change</th><th>Detected</th><th>Status</th>{isAdmin && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {actionable.map((i) => (
                  <tr key={i.id} style={{ cursor: "pointer" }} onClick={() => setDetailFor(i)}>
                    <td>{i.provider_name}</td>
                    <td data-label="Account">{i.account_name}</td>
                    <td data-label="External resource">
                      {i.external_name ?? "—"}
                      {i.external_resource_id ? <><br /><code>{i.external_resource_id}</code></> : null}
                    </td>
                    <td data-label="SCH resource">
                      {i.sch_resource_name ?? "—"}
                      {i.system_name ? <><br /><span className="ux-muted">{i.system_name} · {i.client_company ?? i.client_email}</span></> : null}
                    </td>
                    <td data-label="Change">
                      <StatusMark tone={changeTone(i.change_type)}>{CHANGE_LABELS[i.change_type] ?? i.change_type}</StatusMark>
                      {i.change_summary ? <><br /><span className="ux-muted">{i.change_summary}</span></> : null}
                    </td>
                    <td data-label="Detected">{fmt(i.created_at)}</td>
                    <td data-label="Status">
                      <StatusMark tone={statusTone(i.review_status)}>{i.review_status.replaceAll("_", " ")}</StatusMark>
                      {i.basis_stale && i.review_status !== "stale" ? <><br /><span className="ux-muted">stale basis</span></> : null}
                    </td>
                    {isAdmin && (
                      <td data-label="Actions" onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                          {i.review_status === "pending_review" && (
                            <>
                              <button className="ux-button ux-button-secondary" data-action="acknowledge" disabled={busy}
                                onClick={() => onReview(i.id, "acknowledge", "Acknowledged")}>
                                <EyeOff size={13} /> Ack
                              </button>
                              <button className="ux-button ux-button-secondary" data-action="approve" disabled={busy}
                                onClick={() => onReview(i.id, "approve", "Approved")}>
                                <ThumbsUp size={13} /> Approve
                              </button>
                              <button className="ux-button ux-button-secondary" data-action="reject" disabled={busy}
                                onClick={() => onReview(i.id, "reject", "Rejected")}>
                                <X size={13} /> Reject
                              </button>
                            </>
                          )}
                          {i.review_status === "acknowledged" && (
                            <>
                              <button className="ux-button ux-button-secondary" data-action="approve" disabled={busy}
                                onClick={() => onReview(i.id, "approve", "Approved")}>
                                <ThumbsUp size={13} /> Approve
                              </button>
                              <button className="ux-button ux-button-secondary" data-action="dismiss" disabled={busy}
                                onClick={() => onReview(i.id, "dismiss", "Dismissed")}>
                                <EyeOff size={13} /> Dismiss
                              </button>
                            </>
                          )}
                          {i.review_status === "approved" && APPLIABLE_TYPES.has(i.change_type) && !i.basis_stale && (
                            <button className="ux-button" data-action="apply" disabled={busy}
                              onClick={() => run(() => applyReconciliationItem(i.id), "Applied to SCH inventory")}>
                              <Play size={13} /> Apply
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {runsUnavailable && (
        <div className="ux-card">
          <div className="ux-card-header"><h2>Reconciliation runs</h2></div>
          <p className="ux-muted" style={{ padding: "1rem" }}>
            Unavailable — run history could not be loaded.{" "}
            <button type="button" onClick={() => router.refresh()} className="ux-link">Retry</button>
          </p>
        </div>
      )}
      {!runsUnavailable && runs.length > 0 && (
        <div className="ux-card">
          <div className="ux-card-header"><h2>Reconciliation runs</h2></div>
          <div className="ux-tablewrap">
            <table className="ux-table ux-table--stack ux-table--cards">
              <thead>
                <tr><th>Started</th><th>Status</th><th>Examined</th><th>Changes</th><th>Errors</th><th>Detail</th></tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td>{fmt(r.started_at)}</td>
                    <td data-label="Status"><StatusMark tone={r.status === "completed" ? "success" : r.status === "failed" ? "danger" : "info"}>{r.status}</StatusMark></td>
                    <td data-label="Examined">{r.resources_examined}</td>
                    <td data-label="Changes">{r.changes_detected}</td>
                    <td data-label="Errors">{r.error_count}</td>
                    <td data-label="Detail" className="ux-muted">{r.error_summary ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail — SCH state vs provider state */}
      {target && (
        <Dialog onClose={() => setDetailFor(null)} labelledBy="recon-detail-title" maxWidth={560}>
          <h2 id="recon-detail-title"><GitCompareArrows size={16} style={{ verticalAlign: "-2px" }} /> {CHANGE_LABELS[target.change_type] ?? target.change_type}</h2>
          <p className="ux-muted">
            {target.provider_name} · {target.account_name} · detected {fmt(target.created_at)}
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", margin: "1rem 0" }}>
            <div>
              <p className="ux-row-label">SCH state</p>
              <p>Name: {target.sch_resource_name ?? "—"}</p>
              <p>Status: {target.sch_status ?? "—"}</p>
              <p className="ux-muted">{target.system_name ?? "No linked system"} {target.client_company ? `· ${target.client_company}` : ""}</p>
            </div>
            <div>
              <p className="ux-row-label">Provider state</p>
              <p>Name: {snapshotField(target.current_snapshot, "name")}</p>
              <p>Status: {snapshotField(target.current_snapshot, "status")}</p>
              <p>Region: {snapshotField(target.current_snapshot, "region")}</p>
            </div>
          </div>

          {target.change_summary && (
            <p><strong>Detected change:</strong> {target.change_summary}</p>
          )}
          {target.previous_snapshot && target.current_snapshot && (
            <details>
              <summary className="ux-muted">Snapshot diff detail</summary>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "0.5rem" }}>
                <pre style={{ fontSize: "11px", overflow: "auto" }}>{JSON.stringify(target.previous_snapshot, null, 2)}</pre>
                <pre style={{ fontSize: "11px", overflow: "auto" }}>{JSON.stringify(target.current_snapshot, null, 2)}</pre>
              </div>
            </details>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
            <button className="ux-button ux-button-secondary" onClick={() => setDetailFor(null)}>
              <Check size={13} /> Close
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
