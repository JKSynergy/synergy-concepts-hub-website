"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { NavLink as Link } from "@/components/nav-link";
import { Play, Plus, Activity, Bell } from "lucide-react";
import { Dialog } from "@/components/ux/dialog";
import { StatusMark, type Tone } from "@/components/ux/primitives";
import type { SystemHealthRow } from "@/lib/providers/system-health-server";
import {
  saveMonitoringSchedule,
  setMonitoringScheduleEnabled,
  changeMonitoringScheduleFrequency,
  runMonitoringNow,
} from "@/lib/actions/provider-monitoring";
import { sortActionItems } from "@/lib/operations/action-center";

export interface MonitoringSchedule {
  schedule_id: string;
  provider_account_id: string;
  provider_name: string | null;
  adapter_key: string | null;
  account_name: string | null;
  client_company: string | null;
  connection_status: string | null;
  frequency: string;
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  consecutive_failures: number;
  last_run_status: string | null;
  last_trigger: string | null;
  last_changes_detected: number | null;
  last_signals_created: number | null;
  last_signals_updated: number | null;
  last_error_category: string | null;
  baseline_established_at: string | null;
}

export interface MonitoringRun {
  id: string;
  provider_account_id: string;
  provider_name: string | null;
  account_name: string | null;
  trigger_source: string;
  status: string;
  discovery_status: string | null;
  discovered_count: number | null;
  reconciliation_status: string | null;
  changes_detected: number;
  signals_created: number;
  signals_updated: number;
  incidents_created: number;
  is_baseline: boolean;
  error_category: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface MonitoringSignal {
  id: string;
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
  reconciliation_item_id: string | null;
  detected_at: string;
  first_observed_at: string;
  last_observed_at: string;
  occurrence_count: number;
}

export interface ScheduleAccount {
  id: string;
  account_name: string;
  status: string;
  providers: { name: string; adapter_key: string | null } | { name: string; adapter_key: string | null }[] | null;
}

interface Props {
  systemHealth: SystemHealthRow[];
  schedules: MonitoringSchedule[];
  runs: MonitoringRun[];
  signals: MonitoringSignal[];
  accounts: ScheduleAccount[];
  isAdmin: boolean;
  isFinance: boolean;
  /** True when a section's query failed — render Unavailable, never a false empty/healthy state. */
  systemHealthUnavailable: boolean;
  schedulesUnavailable: boolean;
  runsUnavailable: boolean;
  signalsUnavailable: boolean;
  accountsUnavailable: boolean;
}

const FREQUENCIES = [
  { value: "every_6_hours", label: "Every 6 hours" },
  { value: "every_12_hours", label: "Every 12 hours" },
  { value: "daily", label: "Daily" },
] as const;

function fmt(ts: string | null): string {
  return ts ? new Date(ts).toLocaleString() : "—";
}

function runTone(s: string): Tone {
  switch (s) {
    case "completed": return "success";
    case "failed": return "danger";
    case "skipped": return "neutral";
    case "running": return "info";
    default: return "neutral";
  }
}

function systemHealthTone(status: string): Tone {
  if (status === "HEALTHY") return "success";
  if (status === "ATTENTION") return "warning";
  return "neutral";
}

function sevTone(s: string): Tone {
  switch (s) {
    case "critical": return "danger";
    case "warning": return "warning";
    default: return "info";
  }
}

function healthOf(s: MonitoringSchedule): { label: string; tone: Tone } {
  if (!s.enabled) return { label: "disabled", tone: "neutral" };
  if (!s.last_run_status) return { label: "never run", tone: "neutral" };
  if (s.last_run_status === "completed")
    return (s.last_changes_detected ?? 0) > 0
      ? { label: "changes detected", tone: "warning" }
      : { label: "healthy", tone: "success" };
  if (s.last_run_status === "failed") return { label: "query failed", tone: "danger" };
  return { label: s.last_run_status, tone: "neutral" };
}

export default function MonitoringManager({
  systemHealth,
  schedules,
  runs,
  signals,
  accounts,
  isAdmin,
  systemHealthUnavailable,
  schedulesUnavailable,
  runsUnavailable,
  signalsUnavailable,
  accountsUnavailable,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [frequency, setFrequency] = useState<string>("every_12_hours");
  const [enabled, setEnabled] = useState(false);

  // Open signals ordered by operational urgency — same ordering as Action Center.
  const sortedSignals = useMemo(() => sortActionItems(signals), [signals]);

  const scheduledAccounts = useMemo(
    () => new Set(schedules.map((s) => s.provider_account_id)),
    [schedules]
  );
  const unscheduled = useMemo(
    () =>
      accounts.filter((a) => {
        const p = Array.isArray(a.providers) ? a.providers[0] : a.providers;
        return a.status !== "archived" && p?.adapter_key && !scheduledAccounts.has(a.id);
      }),
    [accounts, scheduledAccounts]
  );

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

  async function onCreate() {
    if (!accountId) return;
    const res = await run(
      () =>
        saveMonitoringSchedule({
          providerAccountId: accountId,
          frequency: frequency as "every_6_hours" | "every_12_hours" | "daily",
          enabled,
        }),
      "Schedule saved"
    );
    if (res.ok) {
      setAddOpen(false);
      setAccountId("");
    }
  }

  return (
    <div>
      {errorMessage && <p className="ux-alert ux-alert-error" role="alert">{errorMessage}</p>}
      {notice && <p className="ux-alert ux-alert-success" role="status">{notice}</p>}

      <div className="ux-card" style={{ marginBottom: "1rem" }}>
        <div className="ux-card-header">
          <h2>System Health</h2>
          <p className="ux-muted">Derived from explicitly linked provider evidence; not an uptime check.</p>
        </div>
        {systemHealthUnavailable ? (
          <p className="ux-muted" style={{ padding: "1rem" }}>
            Unavailable — system health could not be computed.{" "}
            <button type="button" onClick={() => router.refresh()} className="ux-link">Retry</button>
          </p>
        ) : (
        <div className="ux-tablewrap">
          <table className="ux-table">
            <thead><tr><th>System</th><th>Client</th><th>Health</th><th>Infrastructure</th><th>Attention</th><th>Last evidence</th></tr></thead>
            <tbody>
              {systemHealth.map((row) => (
                <tr key={row.systemId}>
                  <td><Link href={`/admin/systems/${row.systemId}`}>{row.systemName}</Link></td>
                  <td>{row.clientName}</td>
                  <td><StatusMark tone={systemHealthTone(row.health.overallStatus)}>{row.health.overallStatus}</StatusMark></td>
                  <td>{row.infrastructureSummary}</td>
                  <td>{row.health.attentionItems.length ? row.health.attentionItems.join(" · ") : "—"}</td>
                  <td>{fmt(row.health.lastEvidenceAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {isAdmin && accountsUnavailable && (
        <p className="ux-muted" style={{ marginBottom: "1rem", fontSize: "0.8125rem" }}>
          Provider accounts unavailable — the schedule form cannot load targets.{" "}
          <button type="button" onClick={() => router.refresh()} className="ux-link">Retry</button>
        </p>
      )}
      {isAdmin && !accountsUnavailable && unscheduled.length > 0 && (
        <div className="ux-card" style={{ marginBottom: "1rem" }}>
          <div className="ux-card-header"><h2>Add monitoring schedule</h2></div>
          <div style={{ padding: "0 1rem 1rem", display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <span className="ux-muted">One schedule per provider account. Scheduled runs are read-only.</span>
            <button className="ux-button" data-action="add-schedule" onClick={() => setAddOpen(true)}>
              <Plus size={14} /> Add schedule
            </button>
          </div>
        </div>
      )}

      <div className="ux-card">
        <div className="ux-card-header">
          <h2>Monitoring schedules</h2>
          <p className="ux-muted">
            {schedulesUnavailable ? "—" : `${schedules.filter((s) => s.enabled).length} enabled`}
          </p>
        </div>
        {schedulesUnavailable ? (
          <p className="ux-muted" style={{ padding: "1rem" }}>
            Unavailable — schedules could not be loaded. This is not the same as no monitoring being configured.{" "}
            <button type="button" onClick={() => router.refresh()} className="ux-link">Retry</button>
          </p>
        ) : schedules.length === 0 ? (
          <p className="ux-muted" style={{ padding: "1rem" }}>
            No monitoring schedules configured. {isAdmin ? "Add one to start periodic observation." : ""}
          </p>
        ) : (
          <div className="ux-tablewrap">
            <table className="ux-table">
              <thead>
                <tr>
                  <th>Provider</th><th>Account</th><th>Cadence</th><th>Enabled</th><th>Last run</th>
                  <th>Status</th><th>Next run</th><th>Failures</th>{isAdmin && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {schedules.map((s) => {
                  const health = healthOf(s);
                  return (
                    <tr key={s.schedule_id} data-schedule={s.schedule_id}>
                      <td>{s.provider_name}</td>
                      <td>
                        {s.account_name}
                        {s.client_company ? <><br /><span className="ux-muted">{s.client_company}</span></> : null}
                      </td>
                      <td>
                        {isAdmin ? (
                          <select
                            className="ux-input"
                            data-action="change-frequency"
                            value={s.frequency}
                            disabled={busy}
                            onChange={(e) =>
                              run(
                                () =>
                                  changeMonitoringScheduleFrequency(
                                    s.provider_account_id,
                                    e.target.value as "every_6_hours" | "every_12_hours" | "daily"
                                  ),
                                "Frequency updated"
                              )
                            }
                          >
                            {FREQUENCIES.map((f) => (
                              <option key={f.value} value={f.value}>{f.label}</option>
                            ))}
                          </select>
                        ) : (
                          s.frequency.replaceAll("_", " ")
                        )}
                      </td>
                      <td>{s.enabled ? "Yes" : "No"}</td>
                      <td>{fmt(s.last_run_at)}</td>
                      <td>
                        <StatusMark tone={health.tone}>{health.label}</StatusMark>
                        {s.last_error_category ? (
                          <><br /><span className="ux-muted">{s.last_error_category}</span></>
                        ) : null}
                      </td>
                      <td>{s.enabled ? fmt(s.next_run_at) : "—"}</td>
                      <td>{s.consecutive_failures}</td>
                      {isAdmin && (
                        <td>
                          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                            <button
                              className="ux-button ux-button-secondary"
                              data-action={s.enabled ? "disable" : "enable"}
                              disabled={busy}
                              onClick={() =>
                                run(
                                  () => setMonitoringScheduleEnabled(s.provider_account_id, !s.enabled),
                                  s.enabled ? "Monitoring disabled" : "Monitoring enabled"
                                )
                              }
                            >
                              {s.enabled ? "Disable" : "Enable"}
                            </button>
                            <button
                              className="ux-button ux-button-secondary"
                              data-action="run-now"
                              disabled={busy}
                              onClick={async () => {
                                const res = await run(
                                  () => runMonitoringNow(s.provider_account_id),
                                  "Monitoring run completed"
                                );
                                const d = res.data as { outcome?: string; isBaseline?: boolean } | undefined;
                                if (res.ok && d?.outcome === "skipped") setNotice("Skipped — a run is already in progress");
                                else if (res.ok && d?.isBaseline) setNotice("Monitoring completed — baseline established without creating signals");
                              }}
                            >
                              <Play size={13} /> Run now
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="ux-card" style={{ marginTop: "1rem" }}>
        <div className="ux-card-header">
          <h2><Bell size={16} style={{ verticalAlign: "-2px" }} /> Open monitoring signals</h2>
          <p className="ux-muted">{signalsUnavailable ? "—" : `${signals.length} open`}</p>
        </div>
        {signalsUnavailable ? (
          <p className="ux-muted" style={{ padding: "1rem" }}>
            Unavailable — the signals feed could not be loaded. A failed query is not evidence of zero alerts.{" "}
            <button type="button" onClick={() => router.refresh()} className="ux-link">Retry</button>
          </p>
        ) : signals.length === 0 ? (
          <p className="ux-muted" style={{ padding: "1rem" }}>No open monitoring signals.</p>
        ) : (
          <div className="ux-tablewrap">
            <table className="ux-table">
              <thead>
                <tr>
                  <th>Severity</th><th>Signal</th><th>Provider</th><th>System / resource</th>
                  <th>First observed</th><th>Last observed</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sortedSignals.map((g) => (
                  <tr key={g.id} data-signal={g.id}>
                    <td><StatusMark tone={sevTone(g.severity)}>{g.severity}</StatusMark></td>
                    <td>
                      {g.title}
                      <br /><span className="ux-muted">{g.summary}</span>
                    </td>
                    <td>{g.provider_name}<br /><span className="ux-muted">{g.account_name}</span></td>
                    <td>
                      {g.system_name ?? g.client_company ?? "—"}
                      <br /><span className="ux-muted">{g.resource_name ?? g.external_name ?? "Provider account"}</span>
                    </td>
                    <td>{fmt(g.first_observed_at)}</td>
                    <td>{fmt(g.last_observed_at)}{g.occurrence_count > 1 ? <><br /><span className="ux-muted">{g.occurrence_count} observations</span></> : null}</td>
                    <td><StatusMark tone={g.status === "acknowledged" ? "info" : "warning"}>{g.status}</StatusMark></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="ux-card" style={{ marginTop: "1rem" }}>
        <div className="ux-card-header">
          <h2><Activity size={16} style={{ verticalAlign: "-2px" }} /> Monitoring history</h2>
          <p className="ux-muted">{runsUnavailable ? "—" : `${runs.length} recent runs`}</p>
        </div>
        {runsUnavailable ? (
          <p className="ux-muted" style={{ padding: "1rem" }}>
            Unavailable — run history could not be loaded.{" "}
            <button type="button" onClick={() => router.refresh()} className="ux-link">Retry</button>
          </p>
        ) : runs.length === 0 ? (
          <p className="ux-muted" style={{ padding: "1rem" }}>No monitoring runs yet.</p>
        ) : (
          <div className="ux-tablewrap">
            <table className="ux-table">
              <thead>
                <tr>
                  <th>Started</th><th>Completed</th><th>Provider</th><th>Account</th><th>Trigger</th>
                  <th>Status</th><th>Observed</th><th>Changes</th><th>Signals</th><th>Error</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} data-run={r.id}>
                    <td>{fmt(r.started_at)}</td>
                    <td>{fmt(r.completed_at)}</td>
                    <td>{r.provider_name}</td>
                    <td>{r.account_name}</td>
                    <td>{r.trigger_source}</td>
                    <td>
                      <StatusMark tone={runTone(r.status)}>{r.status}</StatusMark>
                      {r.is_baseline ? <><br /><span className="ux-muted">Baseline established</span></> : null}
                    </td>
                    <td>{r.discovered_count ?? "—"}</td>
                    <td>{r.changes_detected}</td>
                    <td>{r.signals_created} created · {r.signals_updated} updated</td>
                    <td><span className="ux-muted">{r.error_category ?? "—"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {addOpen && (
        <Dialog onClose={() => setAddOpen(false)} labelledBy="mon-add-title" maxWidth={460}>
          <div style={{ display: "grid", gap: "0.75rem" }}>
            <h2 id="mon-add-title" style={{ margin: 0 }}>Add monitoring schedule</h2>
            <label className="ux-field">
              <span>Provider account</span>
              <select className="ux-input" data-field="account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">Select account…</option>
                {unscheduled.map((a) => {
                  const p = Array.isArray(a.providers) ? a.providers[0] : a.providers;
                  return <option key={a.id} value={a.id}>{p?.name} — {a.account_name}</option>;
                })}
              </select>
            </label>
            <label className="ux-field">
              <span>Frequency</span>
              <select className="ux-input" data-field="frequency" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                {FREQUENCIES.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </label>
            <label className="ux-field" style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
              <input type="checkbox" data-field="enabled" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              <span>Enabled</span>
            </label>
            <p className="ux-muted">
              Scheduled runs discover provider state and reconcile against SCH records — they never change provider infrastructure.
            </p>
            <button className="ux-button" data-action="create-schedule" disabled={busy || !accountId} onClick={onCreate}>
              Save schedule
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
