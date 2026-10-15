"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Dialog } from "@/components/ux/dialog";
import { suspendApplication, resumeApplication } from "@/lib/actions/application-suspension";
import { generateSystemStatusToken } from "@/lib/actions/system-status";
import { Power, PowerOff, KeyRound, Copy, Check, Server, Layers } from "lucide-react";

interface SystemWithSuspension {
  id: string;
  name: string;
  client_id: string;
  status: string;
  suspended_at: string | null;
  suspended_by: string | null;
  suspension_reason: string | null;
  suspension_note: string | null;
  resumed_at: string | null;
  resumed_by: string | null;
}

interface ClientOption {
  id: string;
  label: string;
}

interface Props {
  systems: SystemWithSuspension[];
  /** True when the systems query failed — never render a false "all live" state. */
  systemsUnavailable: boolean;
  clients: ClientOption[];
  isAdmin: boolean;
}

const REASON_OPTIONS = [
  { value: "NON_PAYMENT", label: "Non-payment" },
  { value: "CLIENT_REQUEST", label: "Client request" },
  { value: "CONTRACT_ENDED", label: "Contract ended" },
  { value: "SECURITY", label: "Security" },
  { value: "MAINTENANCE", label: "Maintenance" },
  { value: "OTHER", label: "Other" },
];

type StateKind = "live" | "down" | "warn" | "build" | "idle";

function stateKind(status: string): StateKind {
  switch (status) {
    case "suspended": return "down";
    case "live": return "live";
    case "maintenance_only": return "warn";
    case "in_build": return "build";
    default: return "idle";
  }
}

function reasonTagClass(reason: string): string {
  switch (reason) {
    case "NON_PAYMENT":
    case "SECURITY": return "hx-tag--danger";
    case "MAINTENANCE": return "hx-tag--info";
    case "CLIENT_REQUEST":
    case "CONTRACT_ENDED": return "hx-tag--warn";
    default: return "";
  }
}

/** Client labels arrive as "Company (email)" — split for a two-line tenant cell. */
function splitClient(label: string): { name: string; email: string | null } {
  const m = label.match(/^(.*)\s\(([^()]+@[^()]+)\)$/);
  return m ? { name: m[1], email: m[2] } : { name: label, email: null };
}

function fmt(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  // Deterministic UTC output: identical on server and client, so hydration
  // never mismatches on timestamp text.
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export default function ApplicationSuspensionSection({ systems, systemsUnavailable, clients, isAdmin }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeSystem, setActiveSystem] = useState<SystemWithSuspension | null>(null);
  const [reason, setReason] = useState("NON_PAYMENT");
  const [note, setNote] = useState("");
  const [tokenSystem, setTokenSystem] = useState<SystemWithSuspension | null>(null);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);

  const systemsByClient = useMemo(() => {
    const map = new Map<string, SystemWithSuspension[]>();
    for (const s of systems) {
      const list = map.get(s.client_id) ?? [];
      list.push(s);
      map.set(s.client_id, list);
    }
    return map;
  }, [systems]);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) setError(res.error || "Operation failed");
    else setNotice(okMsg);
    router.refresh();
  }

  async function onSuspend(e: React.FormEvent) {
    e.preventDefault();
    if (!activeSystem) return;
    await run(
      () => suspendApplication(activeSystem.id, reason, note.trim() || null),
      `Application access suspended for ${activeSystem.name}`
    );
    if (!error) {
      setActiveSystem(null);
      setNote("");
    }
  }

  async function onResume() {
    if (!activeSystem) return;
    await run(
      () => resumeApplication(activeSystem.id, note.trim() || null),
      `Application access resumed for ${activeSystem.name}`
    );
    if (!error) {
      setActiveSystem(null);
      setNote("");
    }
  }

  async function onGenerateToken(system: SystemWithSuspension) {
    setBusy(true);
    setError(null);
    setNotice(null);
    setGeneratedToken(null);
    const res = await generateSystemStatusToken(system.id);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      setTokenSystem(null);
    } else if (res.token) {
      setGeneratedToken(res.token);
      setTokenSystem(system);
      setTokenCopied(false);
      setNotice(`Status token generated for ${system.name}. Copy it now — it will not be shown again.`);
    }
  }

  const suspendedCount = systems.filter((s) => s.status === "suspended").length;
  const liveCount = systems.filter((s) => s.status === "live").length;
  const otherCount = systems.length - suspendedCount - liveCount;
  const total = systems.length;
  const pct = (n: number) => (total ? `${Math.round((n / total) * 100)}%` : "0%");

  return (
    <section className="hx-console" aria-labelledby="hx-console-title">
      <div className="hx-console-bar">
        <div className="hx-console-title">
          <Server size={16} />
          <div>
            <h2 id="hx-console-title">Managed System Service Status</h2>
            <div className="hx-console-sub">Application-layer control · provider infrastructure is not affected</div>
          </div>
        </div>
        {systemsUnavailable ? (
          <span className="hx-plane"><span className="hx-led" /> status unavailable</span>
        ) : (
          <span className="hx-plane">
            <span className={`hx-led ${suspendedCount > 0 ? "hx-led--down" : "hx-led--live"}`} />
            {suspendedCount > 0 ? `${suspendedCount} service${suspendedCount === 1 ? "" : "s"} suspended` : "all services operational"}
          </span>
        )}
      </div>

      <div className="hx-stats">
        <div className="hx-stat">
          <div className="hx-stat-label"><Layers size={12} /> Instances</div>
          <div className="hx-stat-value">{systemsUnavailable ? "—" : total}</div>
          <div className="hx-meter"><i style={{ width: "100%", background: "rgba(255,255,255,.35)" }} /></div>
        </div>
        <div className="hx-stat">
          <div className="hx-stat-label"><span className="hx-led hx-led--live" style={{ width: 6, height: 6 }} /> Live</div>
          <div className="hx-stat-value">{systemsUnavailable ? "—" : liveCount}<small>{systemsUnavailable ? "" : pct(liveCount)}</small></div>
          <div className="hx-meter"><i style={{ width: pct(liveCount), background: "var(--hx-live)" }} /></div>
        </div>
        <div className="hx-stat">
          <div className="hx-stat-label"><span className="hx-led hx-led--down" style={{ width: 6, height: 6 }} /> Suspended</div>
          <div className="hx-stat-value">{systemsUnavailable ? "—" : suspendedCount}<small>{systemsUnavailable ? "" : pct(suspendedCount)}</small></div>
          <div className="hx-meter"><i style={{ width: pct(suspendedCount), background: "var(--hx-down)" }} /></div>
        </div>
        <div className="hx-stat">
          <div className="hx-stat-label"><span className="hx-led hx-led--build" style={{ width: 6, height: 6 }} /> Build / other</div>
          <div className="hx-stat-value">{systemsUnavailable ? "—" : otherCount}<small>{systemsUnavailable ? "" : pct(otherCount)}</small></div>
          <div className="hx-meter"><i style={{ width: pct(otherCount), background: "var(--hx-build)" }} /></div>
        </div>
      </div>

      {error && <p className="ux-alert ux-alert-error" role="alert">{error}</p>}
      {notice && <p className="ux-alert ux-alert-success" role="status">{notice}</p>}

      <div className="hx-tablewrap">
        <table className="hx-table">
          <thead>
            <tr><th>Service</th><th>Tenant</th><th>State</th><th>Last suspension</th><th>Reason</th><th style={{ textAlign: "right" }}>Controls</th></tr>
          </thead>
          <tbody>
            {systemsUnavailable ? (
              <tr>
                <td colSpan={6} className="hx-empty">
                  ERR: system status unavailable — the data source could not be reached.{" "}
                  <a href="/admin/operations/suspensions" className="ux-link">Retry</a>
                </td>
              </tr>
            ) : systems.length === 0 ? (
              <tr><td colSpan={6} className="hx-empty">No managed systems provisioned.</td></tr>
            ) : (
              systems.map((s) => {
                const client = clients.find((c) => c.id === s.client_id);
                const { name: tenant, email } = splitClient(client?.label || s.client_id);
                const st = stateKind(s.status);
                const isDown = s.status === "suspended";
                const resumedAfter = !isDown && s.resumed_at && s.suspended_at && s.resumed_at >= s.suspended_at;
                return (
                  <tr key={s.id} className={isDown ? "is-down" : undefined}>
                    <td>
                      <div className="hx-svc">
                        <span className="hx-svc-icon"><Server size={16} /></span>
                        <div>
                          <Link href={`/admin/systems/${s.id}`} className="hx-svc-name">{s.name}</Link>
                          <span className="hx-mono">sys_{s.id.replace(/-/g, "").slice(0, 10)}</span>
                        </div>
                      </div>
                    </td>
                    <td className="hx-tenant">
                      <b>{tenant}</b>
                      {email && <span className="hx-mono">{email}</span>}
                    </td>
                    <td>
                      <span className={`hx-state hx-state--${st}`}>
                        <span className={`hx-led hx-led--${st}`} />
                        {s.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td>
                      {s.suspended_at ? (
                        <div className="hx-event">
                          {fmt(s.suspended_at)}
                          {resumedAfter && <span>resumed {fmt(s.resumed_at)}</span>}
                        </div>
                      ) : (
                        <span className="hx-mono">never</span>
                      )}
                    </td>
                    <td>
                      {s.suspension_reason ? (
                        <span className={`hx-tag ${reasonTagClass(s.suspension_reason)}`}>{s.suspension_reason.replace(/_/g, " ")}</span>
                      ) : (
                        <span className="hx-mono">—</span>
                      )}
                    </td>
                    <td>
                      {isAdmin && (
                        <div className="hx-actions">
                          <button
                            className="hx-btn"
                            disabled={busy}
                            onClick={() => onGenerateToken(s)}
                            title="Generate or rotate status token"
                          >
                            <KeyRound size={13} /> Token
                          </button>
                          {isDown ? (
                            <button
                              className="hx-btn hx-btn--go"
                              disabled={busy}
                              onClick={() => { setActiveSystem(s); setNote(s.suspension_note || ""); }}
                            >
                              <Power size={13} /> Resume
                            </button>
                          ) : (
                            <button
                              className="hx-btn hx-btn--danger"
                              disabled={busy}
                              onClick={() => { setActiveSystem(s); setReason("NON_PAYMENT"); setNote(""); }}
                            >
                              <PowerOff size={13} /> Suspend
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="hx-console-foot">
        <span>endpoint · portal.synergyconceptshub.com/api/systems/:id/status</span>
        <span>times in UTC</span>
      </div>

      {activeSystem && activeSystem.status !== "suspended" && (
        <Dialog onClose={() => setActiveSystem(null)} labelledBy="suspend-title" maxWidth={480}>
          <h2 id="suspend-title"><PowerOff size={18} style={{ verticalAlign: "-3px" }} /> Suspend managed system</h2>
          <p className="ux-muted">
            System: <strong>{activeSystem.name}</strong><br />
            Client: {clients.find((c) => c.id === activeSystem.client_id)?.label || activeSystem.client_id}
          </p>
          <p className="ux-muted" style={{ fontSize: "0.85rem" }}>
            This will make the managed application inaccessible to all users. Railway, Vercel and other provider infrastructure will continue running.
          </p>
          <form onSubmit={onSuspend} style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
            <div>
              <label className="ux-label">Reason *</label>
              <select className="ux-select" style={{ width: "100%" }} value={reason} onChange={(e) => setReason(e.target.value)} required>
                {REASON_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="ux-label">Internal note</label>
              <textarea
                className="ux-input"
                style={{ width: "100%", minHeight: "4rem" }}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional internal note"
              />
            </div>
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button type="button" className="ux-button ux-button-secondary" onClick={() => setActiveSystem(null)} disabled={busy}>Cancel</button>
              <button type="submit" className="ux-button" disabled={busy || !reason}>Suspend managed system</button>
            </div>
          </form>
        </Dialog>
      )}

      {tokenSystem && generatedToken && (
        <Dialog onClose={() => { setTokenSystem(null); setGeneratedToken(null); setTokenCopied(false); }} labelledBy="token-title" maxWidth={520}>
          <h2 id="token-title"><KeyRound size={18} style={{ verticalAlign: "-3px" }} /> Status token generated</h2>
          <p className="ux-muted">
            System: <strong>{tokenSystem.name}</strong>
          </p>
          <p className="ux-alert ux-alert-warning" style={{ fontSize: "0.85rem" }}>
            This token is shown only once. Copy it into the managed application environment and store it as a server-side secret.
          </p>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
            <pre style={{ flex: 1, margin: 0, wordBreak: "break-all", whiteSpace: "pre-wrap", background: "var(--ux-surface-2)", padding: "0.75rem", borderRadius: "0.25rem", fontSize: "0.8rem" }}>{generatedToken}</pre>
            <button
              type="button"
              className="ux-button ux-button-secondary"
              style={{ whiteSpace: "nowrap" }}
              onClick={() => {
                navigator.clipboard.writeText(generatedToken).then(() => setTokenCopied(true)).catch(() => setTokenCopied(false));
              }}
            >
              {tokenCopied ? <Check size={14} /> : <Copy size={14} />} {tokenCopied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="ux-muted" style={{ fontSize: "0.85rem" }}>
            Endpoint: <code>https://portal.synergyconceptshub.com/api/systems/{tokenSystem.id}/status</code>
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
            <button type="button" className="ux-button ux-button-secondary" onClick={() => { setTokenSystem(null); setGeneratedToken(null); }}>Done</button>
          </div>
        </Dialog>
      )}

      {activeSystem && activeSystem.status === "suspended" && (
        <Dialog onClose={() => setActiveSystem(null)} labelledBy="resume-title" maxWidth={480}>
          <h2 id="resume-title"><Power size={18} style={{ verticalAlign: "-3px" }} /> Resume managed system</h2>
          <p className="ux-muted">
            System: <strong>{activeSystem.name}</strong><br />
            Suspended: {fmt(activeSystem.suspended_at)}
            {activeSystem.suspension_reason ? <> · Reason: {activeSystem.suspension_reason.replace(/_/g, " ")}</> : null}
          </p>
          <p className="ux-muted" style={{ fontSize: "0.85rem" }}>
            The managed application will become accessible again. No provider infrastructure is modified.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
            <div>
              <label className="ux-label">Internal note</label>
              <textarea
                className="ux-input"
                style={{ width: "100%", minHeight: "4rem" }}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional internal note"
              />
            </div>
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button type="button" className="ux-button ux-button-secondary" onClick={() => setActiveSystem(null)} disabled={busy}>Cancel</button>
              <button type="button" className="ux-button" onClick={onResume} disabled={busy}>Resume managed system</button>
            </div>
          </div>
        </Dialog>
      )}
    </section>
  );
}
