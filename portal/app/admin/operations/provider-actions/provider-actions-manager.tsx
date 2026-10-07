"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Play, Check, X, Ban, RefreshCw, Plus } from "lucide-react";
import { Dialog } from "@/components/ux/dialog";
import { StatusMark, type Tone } from "@/components/ux/primitives";
import {
  proposeProviderOperation,
  reviewProviderOperation,
  executeProviderOperation,
  verifyProviderOperation,
} from "@/lib/actions/provider-operations";
import {
  PROVIDER_OPERATION_DEFS,
  providerSupportsOperation,
  PROVIDER_OPERATION_KEYS,
} from "@/lib/providers/operations";
import type { ProviderOperationKey } from "@/lib/providers/types";

export interface OperationProposal {
  id: string;
  provider_account_id: string;
  discovered_resource_id: string;
  resource_id: string;
  provider_name: string | null;
  adapter_key: string | null;
  account_name: string | null;
  connection_status: string | null;
  external_resource_id: string | null;
  external_type: string | null;
  external_name: string | null;
  provider_status: string | null;
  external_missing: boolean | null;
  sch_resource_name: string | null;
  sch_status: string | null;
  system_name: string | null;
  client_company: string | null;
  operation_key: string;
  reason: string | null;
  status: string;
  basis_snapshot: Record<string, unknown> | null;
  requested_by_name: string | null;
  approved_at: string | null;
  basis_stale: boolean | null;
  created_at: string;
}

export interface OperationExecution {
  id: string;
  proposal_id: string;
  operation_key: string;
  status: string;
  provider_result_category: string | null;
  verification_status: string | null;
  observed_provider_status: string | null;
  error_category: string | null;
  safe_error_message: string | null;
  started_at: string;
  completed_at: string | null;
  verified_at: string | null;
}

export interface OperationTarget {
  id: string;
  name: string;
  status: string | null;
  external_resource_id: string;
  resource_type: string;
  external_missing: boolean;
  provider_accounts:
    | { account_name: string; providers: { name: string; adapter_key: string | null } | { name: string; adapter_key: string | null }[] | null }
    | null;
  resources: { name: string } | { name: string }[] | null;
}

interface Props {
  proposals: OperationProposal[];
  executions: OperationExecution[];
  targets: OperationTarget[];
  isAdmin: boolean;
  isFinance: boolean;
}

function statusTone(s: string): Tone {
  switch (s) {
    case "verified": return "success";
    case "approved": return "info";
    case "proposed": return "warning";
    case "executing": case "verification_pending": return "info";
    case "failed": case "verification_failed": return "danger";
    case "rejected": case "cancelled": case "stale": return "neutral";
    default: return "neutral";
  }
}

function fmt(ts: string | null): string {
  return ts ? new Date(ts).toLocaleString() : "—";
}

function targetProvider(t: OperationTarget): { name?: string; adapter_key?: string | null; account_name?: string } {
  const acct = Array.isArray(t.provider_accounts) ? t.provider_accounts[0] : t.provider_accounts;
  const prov = acct?.providers;
  const p = Array.isArray(prov) ? prov[0] : prov;
  return { name: p?.name, adapter_key: p?.adapter_key, account_name: acct?.account_name };
}

export default function ProviderActionsManager({ proposals, executions, targets, isAdmin }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [proposeOpen, setProposeOpen] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [opKey, setOpKey] = useState<string>("");
  const [reason, setReason] = useState("");
  const [detailFor, setDetailFor] = useState<OperationProposal | null>(null);

  const selectedTarget = useMemo(() => targets.find((t) => t.id === targetId) ?? null, [targets, targetId]);
  const supportedOps = useMemo(() => {
    if (!selectedTarget) return [] as ProviderOperationKey[];
    const key = targetProvider(selectedTarget).adapter_key;
    return PROVIDER_OPERATION_KEYS.filter((k) =>
      providerSupportsOperation(key, k, selectedTarget.resource_type));
  }, [selectedTarget]);

  const execByProposal = useMemo(() => {
    const m = new Map<string, OperationExecution[]>();
    for (const e of executions) {
      const arr = m.get(e.proposal_id) ?? [];
      arr.push(e);
      m.set(e.proposal_id, arr);
    }
    return m;
  }, [executions]);

  async function run(fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, okMsg?: string) {
    setBusy(true);
    setErrorMessage(null);
    setNotice(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) setErrorMessage(res.error || "Operation failed");
    else if (res.error) setErrorMessage(res.error); // soft notices (e.g. still transitioning)
    else if (okMsg) setNotice(okMsg);
    router.refresh();
    return res;
  }

  async function onPropose() {
    if (!targetId || !opKey) return;
    const res = await run(() =>
      proposeProviderOperation({ discoveredId: targetId, operationKey: opKey, reason }), "Proposal created");
    if (res.ok) {
      setProposeOpen(false);
      setTargetId("");
      setOpKey("");
      setReason("");
    }
  }

  const target = detailFor;

  return (
    <div>
      {errorMessage && <p className="ux-alert ux-alert-error" role="alert">{errorMessage}</p>}
      {notice && <p className="ux-alert ux-alert-success" role="status">{notice}</p>}

      {isAdmin && (
        <div className="ux-card" style={{ marginBottom: "1rem" }}>
          <div className="ux-card-header"><h2>New provider operation</h2></div>
          <div style={{ padding: "0 1rem 1rem", display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <span className="ux-muted">
              Operations are proposed, approved, executed server-side, then verified against the provider.
            </span>
            <button className="ux-button" data-action="new-operation" onClick={() => setProposeOpen(true)}>
              <Plus size={14} /> Propose operation
            </button>
          </div>
        </div>
      )}

      <div className="ux-card">
        <div className="ux-card-header">
          <h2>Operation proposals</h2>
          <p className="ux-muted">{proposals.filter((p) => ["proposed", "approved"].includes(p.status)).length} pending decision or execution</p>
        </div>
        {proposals.length === 0 ? (
          <p className="ux-muted" style={{ padding: "1rem" }}>No provider operations proposed yet.</p>
        ) : (
          <div className="ux-tablewrap">
            <table className="ux-table">
              <thead>
                <tr>
                  <th>Provider</th><th>Account</th><th>Resource</th><th>Operation</th>
                  <th>Provider state</th><th>Requested</th><th>Status</th>{isAdmin && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {proposals.map((p) => (
                  <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => setDetailFor(p)}>
                    <td>{p.provider_name}</td>
                    <td>{p.account_name}</td>
                    <td>
                      {p.sch_resource_name ?? p.external_name ?? "—"}
                      {p.external_resource_id ? <><br /><code>{p.external_resource_id}</code></> : null}
                    </td>
                    <td>{PROVIDER_OPERATION_DEFS[p.operation_key as ProviderOperationKey]?.label ?? p.operation_key}</td>
                    <td>{p.provider_status ?? "—"}</td>
                    <td>{fmt(p.created_at)}</td>
                    <td>
                      <StatusMark tone={statusTone(p.status)}>{p.status.replaceAll("_", " ")}</StatusMark>
                      {p.basis_stale && p.status !== "stale" ? <><br /><span className="ux-muted">stale basis</span></> : null}
                    </td>
                    {isAdmin && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                          {p.status === "proposed" && (
                            <>
                              <button className="ux-button ux-button-secondary" data-action="approve" disabled={busy}
                                onClick={() => run(() => reviewProviderOperation(p.id, "approve"), "Approved")}>
                                <Check size={13} /> Approve
                              </button>
                              <button className="ux-button ux-button-secondary" data-action="reject" disabled={busy}
                                onClick={() => run(() => reviewProviderOperation(p.id, "reject"), "Rejected")}>
                                <X size={13} /> Reject
                              </button>
                            </>
                          )}
                          {p.status === "approved" && !p.basis_stale && (
                            <>
                              <button className="ux-button" data-action="execute" disabled={busy}
                                onClick={() => run(() => executeProviderOperation(p.id), "Executed — verifying provider state")}>
                                <Play size={13} /> Execute
                              </button>
                              <button className="ux-button ux-button-secondary" data-action="cancel" disabled={busy}
                                onClick={() => run(() => reviewProviderOperation(p.id, "cancel"), "Cancelled")}>
                                <Ban size={13} /> Cancel
                              </button>
                            </>
                          )}
                          {p.status === "verification_pending" && (
                            <button className="ux-button ux-button-secondary" data-action="verify" disabled={busy}
                              onClick={() => run(() => verifyProviderOperation(p.id), "Verified")}>
                              <ShieldCheck size={13} /> Verify
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

      {executions.length > 0 && (
        <div className="ux-card">
          <div className="ux-card-header"><h2>Execution history</h2></div>
          <div className="ux-tablewrap">
            <table className="ux-table">
              <thead>
                <tr>
                  <th>Started</th><th>Operation</th><th>Provider result</th>
                  <th>Verification</th><th>Observed</th><th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {executions.map((e) => (
                  <tr key={e.id}>
                    <td>{fmt(e.started_at)}</td>
                    <td>{PROVIDER_OPERATION_DEFS[e.operation_key as ProviderOperationKey]?.label ?? e.operation_key}</td>
                    <td>{e.provider_result_category ?? "—"}</td>
                    <td><StatusMark tone={statusTone(e.status)}>{e.status.replaceAll("_", " ")}</StatusMark></td>
                    <td>{e.observed_provider_status ?? "—"}</td>
                    <td className="ux-muted">{e.safe_error_message ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Proposal detail — SCH state vs provider state, lifecycle, executions */}
      {target && (
        <Dialog onClose={() => setDetailFor(null)} labelledBy="op-detail-title" maxWidth={560}>
          <h2 id="op-detail-title"><ShieldCheck size={16} style={{ verticalAlign: "-2px" }} /> {PROVIDER_OPERATION_DEFS[target.operation_key as ProviderOperationKey]?.label ?? target.operation_key}</h2>
          <p className="ux-muted">
            {target.provider_name} · {target.account_name} · requested {fmt(target.created_at)}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", margin: "1rem 0" }}>
            <div>
              <p className="ux-row-label">SCH resource</p>
              <p>Name: {target.sch_resource_name ?? "—"}</p>
              <p>Status: {target.sch_status ?? "—"}</p>
              <p className="ux-muted">{target.system_name ?? "—"} {target.client_company ? `· ${target.client_company}` : ""}</p>
            </div>
            <div>
              <p className="ux-row-label">Provider state</p>
              <p>Name: {target.external_name ?? "—"}</p>
              <p>Status: {target.provider_status ?? "—"}</p>
              <p className="ux-muted">Basis: {String(target.basis_snapshot?.status ?? "—")}{target.basis_stale ? " · stale" : ""}</p>
            </div>
          </div>
          {target.reason && <p><strong>Reason:</strong> {target.reason}</p>}
          <p><strong>Status:</strong> {target.status.replaceAll("_", " ")}</p>

          {(execByProposal.get(target.id) ?? []).length > 0 && (
            <div style={{ marginTop: "0.5rem" }}>
              <p className="ux-row-label">Executions</p>
              {(execByProposal.get(target.id) ?? []).map((e) => (
                <p key={e.id} className="ux-muted" style={{ margin: "0.25rem 0" }}>
                  {fmt(e.started_at)} — {e.status.replaceAll("_", " ")}
                  {e.provider_result_category ? ` · ${e.provider_result_category}` : ""}
                  {e.observed_provider_status ? ` · observed ${e.observed_provider_status}` : ""}
                </p>
              ))}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
            <button className="ux-button ux-button-secondary" onClick={() => setDetailFor(null)}>
              <Check size={13} /> Close
            </button>
          </div>
        </Dialog>
      )}

      {/* Propose dialog */}
      {proposeOpen && isAdmin && (
        <Dialog onClose={() => setProposeOpen(false)} labelledBy="op-propose-title" maxWidth={520}>
          <h2 id="op-propose-title"><RefreshCw size={16} style={{ verticalAlign: "-2px" }} /> Propose provider operation</h2>
          <div className="ux-form" style={{ marginTop: "1rem" }}>
            <label className="ux-field">
              <span className="ux-row-label">Linked resource</span>
              <select
                id="select-op-target"
                className="ux-select"
                style={{ width: "100%" }}
                value={targetId}
                onChange={(e) => { setTargetId(e.target.value); setOpKey(""); }}
              >
                <option value="">Select a linked provider resource...</option>
                {targets.filter((t) => !t.external_missing).map((t) => {
                  const p = targetProvider(t);
                  return (
                    <option key={t.id} value={t.id}>
                      {p.name} — {p.account_name} — {t.name} ({t.status ?? "unknown"})
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="ux-field">
              <span className="ux-row-label">Operation</span>
              <select
                id="select-op-key"
                className="ux-select"
                style={{ width: "100%" }}
                value={opKey}
                onChange={(e) => setOpKey(e.target.value)}
                disabled={!selectedTarget}
              >
                <option value="">
                  {selectedTarget
                    ? supportedOps.length ? "Select operation..." : "No supported operations for this provider/resource"
                    : "Select a resource first"}
                </option>
                {supportedOps.map((k) => (
                  <option key={k} value={k}>{PROVIDER_OPERATION_DEFS[k].label}</option>
                ))}
              </select>
            </label>
            <label className="ux-field">
              <span className="ux-row-label">Reason</span>
              <input
                id="input-op-reason"
                className="ux-input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this operation needed?"
              />
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
              <button className="ux-button ux-button-secondary" onClick={() => setProposeOpen(false)}>Cancel</button>
              <button
                className="ux-button"
                data-action="submit-proposal"
                disabled={busy || !targetId || !opKey || !reason.trim()}
                onClick={onPropose}
              >
                Create proposal
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
