"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Settings2, ShieldCheck, Workflow } from "lucide-react";
import { Dialog } from "@/components/ux/dialog";
import { StatusMark, type Tone } from "@/components/ux/primitives";
import { saveAutomationRule } from "@/lib/actions/provider-automation";

export interface AutomationRule {
  id: string;
  rule_key: string;
  name: string;
  description: string;
  risk_class: "internal_safe" | "approval_required";
  scope: "account" | "sweep";
  enabled: boolean;
  threshold: number;
  cooldown_seconds: number;
  last_evaluated_at: string | null;
  last_decision: string | null;
  last_detail: string | null;
  last_action_at: string | null;
}

export interface AutomationRun {
  id: string;
  rule_key: string;
  rule_name: string;
  risk_class: string;
  scope_key: string;
  provider_account_id: string | null;
  account_name: string | null;
  monitoring_run_id: string | null;
  trigger_source: string;
  decision: string;
  detail: string | null;
  action_item_id: string | null;
  task_id: string | null;
  proposal_id: string | null;
  evaluated_at: string;
}

interface Props {
  rules: AutomationRule[];
  runs: AutomationRun[];
  isAdmin: boolean;
}

const RISK_LABELS: Record<string, string> = {
  internal_safe: "Internal — auto",
  approval_required: "Approval required",
};

const TRIGGER_LABELS: Record<string, string> = {
  account: "After every monitoring / event run",
  sweep: "Scheduled sweep + every monitoring run",
};

function fmt(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  // Deterministic UTC text (same on server and client), matching Operations and Systems.
  return Number.isNaN(d.getTime()) ? "—" : `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function fmtCooldown(secs: number): string {
  if (secs === 0) return "none";
  if (secs % 86400 === 0) return `${secs / 86400}d`;
  if (secs % 3600 === 0) return `${secs / 3600}h`;
  if (secs % 60 === 0) return `${secs / 60}m`;
  return `${secs}s`;
}

function decisionTone(s: string): Tone {
  switch (s) {
    case "acted": return "success";
    case "proposal_created": return "info";
    case "resolved": return "success";
    case "failed": return "danger";
    case "skipped_cooldown": case "skipped_duplicate": case "skipped_disabled":
      return "neutral";
    default: return "neutral";
  }
}

export default function AutomationManager({ rules, runs, isAdmin }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<AutomationRule | null>(null);
  const [threshold, setThreshold] = useState("");
  const [cooldown, setCooldown] = useState("");

  async function run<T>(fn: () => Promise<{ ok: boolean; error?: string; data?: T }>, okMsg?: string) {
    setBusy(true);
    setErrorMessage(null);
    setNotice(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) setErrorMessage(res.error || "Action failed");
    else if (res.error) setErrorMessage(res.error);
    else if (okMsg) setNotice(okMsg);
    router.refresh();
    return res;
  }

  async function toggle(r: AutomationRule) {
    await run(
      () =>
        saveAutomationRule({
          ruleKey: r.rule_key,
          enabled: !r.enabled,
          threshold: r.threshold,
          cooldownSeconds: r.cooldown_seconds,
        }),
      r.enabled ? "Rule disabled" : "Rule enabled"
    );
  }

  async function onSave() {
    if (!editing) return;
    const res = await run(
      () =>
        saveAutomationRule({
          ruleKey: editing.rule_key,
          enabled: editing.enabled,
          threshold: Number(threshold),
          cooldownSeconds: Number(cooldown),
        }),
      "Rule updated"
    );
    if (res.ok) setEditing(null);
  }

  return (
    <div>
      {errorMessage && <p className="ux-alert ux-alert-error" role="alert">{errorMessage}</p>}
      {notice && <p className="ux-alert ux-alert-success" role="status">{notice}</p>}

      <div className="ux-card">
        <div className="ux-card-header">
          <h2><Workflow size={16} style={{ verticalAlign: "-2px" }} /> Automation rules</h2>
          <p className="ux-muted">{rules.filter((r) => r.enabled).length} of {rules.length} enabled</p>
        </div>
        {rules.length === 0 ? (
          <p className="ux-muted" style={{ padding: "1rem" }}>No automation rules visible.</p>
        ) : (
          <div className="ux-tablewrap">
            <table className="ux-table ux-table--stack ux-table--cards">
              <thead>
                <tr>
                  <th>Rule</th><th>Risk class</th><th>Trigger</th><th>Threshold</th>
                  <th>Cooldown</th><th>Status</th><th>Last action</th>{isAdmin && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id} data-rule={r.rule_key}>
                    <td>
                      <strong>{r.name}</strong>
                      <br />
                      <span className="ux-muted">{r.description}</span>
                    </td>
                    <td data-label="Risk class">
                      <StatusMark tone={r.risk_class === "approval_required" ? "warning" : "success"}>
                        {RISK_LABELS[r.risk_class] ?? r.risk_class}
                      </StatusMark>
                      {r.risk_class === "approval_required" && (
                        <><br /><span className="ux-muted"><ShieldCheck size={11} style={{ verticalAlign: "-1px" }} /> creates proposal only</span></>
                      )}
                    </td>
                    <td data-label="Trigger">{TRIGGER_LABELS[r.scope] ?? r.scope}</td>
                    <td data-label="Threshold">{r.threshold}</td>
                    <td data-label="Cooldown">{fmtCooldown(r.cooldown_seconds)}</td>
                    <td data-label="Status">
                      <StatusMark tone={r.enabled ? "success" : "neutral"}>
                        {r.enabled ? "enabled" : "disabled"}
                      </StatusMark>
                    </td>
                    <td data-label="Last action">
                      {fmt(r.last_action_at)}
                      {r.last_decision && (
                        <><br /><span className="ux-muted">last: {r.last_decision}</span></>
                      )}
                    </td>
                    {isAdmin && (
                      <td data-label="Actions">
                        <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                          <button
                            className="ux-button ux-button-secondary"
                            data-action={r.enabled ? "disable-rule" : "enable-rule"}
                            disabled={busy}
                            onClick={() => toggle(r)}
                          >
                            {r.enabled ? "Disable" : "Enable"}
                          </button>
                          <button
                            className="ux-button ux-button-secondary"
                            data-action="configure-rule"
                            disabled={busy}
                            onClick={() => {
                              setEditing(r);
                              setThreshold(String(r.threshold));
                              setCooldown(String(r.cooldown_seconds));
                            }}
                          >
                            <Settings2 size={13} /> Configure
                          </button>
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

      <div className="ux-card" style={{ marginTop: "1rem" }}>
        <div className="ux-card-header">
          <h2>Automation history</h2>
          <p className="ux-muted">{runs.length} evaluations</p>
        </div>
        {runs.length === 0 ? (
          <p className="ux-muted" style={{ padding: "1rem" }}>
            No automation evaluations recorded yet. Rules evaluate after each monitoring run and on the scheduled sweep.
          </p>
        ) : (
          <div className="ux-tablewrap">
            <table className="ux-table ux-table--stack ux-table--cards">
              <thead>
                <tr>
                  <th>Evaluated</th><th>Rule</th><th>Scope</th><th>Trigger</th>
                  <th>Decision</th><th>Created</th><th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} data-run={r.id}>
                    <td>{fmt(r.evaluated_at)}</td>
                    <td data-label="Rule">{r.rule_name}</td>
                    <td data-label="Scope">
                      {r.account_name ?? r.scope_key}
                      {r.account_name && r.scope_key !== `acct:${r.provider_account_id}` && (
                        <><br /><span className="ux-muted">{r.scope_key}</span></>
                      )}
                    </td>
                    <td data-label="Trigger">{r.trigger_source}</td>
                    <td data-label="Decision"><StatusMark tone={decisionTone(r.decision)}>{r.decision}</StatusMark></td>
                    <td data-label="Created">
                      {[
                        r.action_item_id ? "signal" : null,
                        r.task_id ? "task" : null,
                        r.proposal_id ? "proposal" : null,
                      ].filter(Boolean).join(" + ") || "—"}
                    </td>
                    <td data-label="Detail"><span className="ux-muted">{r.detail ?? "—"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <Dialog onClose={() => setEditing(null)} labelledBy="auto-rule-title" maxWidth={460}>
          <div style={{ display: "grid", gap: "0.75rem" }}>
            <h2 id="auto-rule-title" style={{ margin: 0 }}>Configure: {editing.name}</h2>
            <p className="ux-muted">{editing.description}</p>
            <label className="ux-field">
              <span>Threshold</span>
              <input
                className="ux-input"
                data-field="rule-threshold"
                type="number"
                min={1}
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
              />
            </label>
            <label className="ux-field">
              <span>Cooldown (seconds)</span>
              <input
                className="ux-input"
                data-field="rule-cooldown"
                type="number"
                min={0}
                value={cooldown}
                onChange={(e) => setCooldown(e.target.value)}
              />
            </label>
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button className="ux-button ux-button-secondary" onClick={() => setEditing(null)} disabled={busy}>
                Cancel
              </button>
              <button className="ux-button" data-action="save-rule" onClick={onSave} disabled={busy}>
                Save
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
