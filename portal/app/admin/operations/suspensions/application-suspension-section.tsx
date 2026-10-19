"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Dialog } from "@/components/ux/dialog";
import { suspendApplication, resumeApplication } from "@/lib/actions/application-suspension";
import { generateSystemStatusToken } from "@/lib/actions/system-status";
import { Power, PowerOff, KeyRound, Copy, Check, Server, ChevronDown, ShieldAlert } from "lucide-react";

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

/** One audited service action, already resolved to names on the server. */
export interface ServiceActivity {
  id: string;
  action: string;
  systemId: string | null;
  systemName: string;
  at: string;
  actor: string | null;
  reason: string | null;
  note: string | null;
  error: string | null;
}

interface Props {
  systems: SystemWithSuspension[];
  /** True when the systems query failed — never render a false "all live" state. */
  systemsUnavailable: boolean;
  clients: ClientOption[];
  isAdmin: boolean;
  activity: ServiceActivity[];
  /** Name recorded against actions taken from this page. */
  actorLabel: string;
}

const REASON_OPTIONS = [
  { value: "NON_PAYMENT", label: "Non-payment" },
  { value: "CLIENT_REQUEST", label: "Client request" },
  { value: "CONTRACT_ENDED", label: "Contract ended" },
  { value: "SECURITY", label: "Security" },
  { value: "MAINTENANCE", label: "Maintenance" },
  { value: "OTHER", label: "Other" },
];

const MIN_NOTE = 5;
const SUSPEND_WORD = "SUSPEND";

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
    case "CLIENT_REQUEST":
    case "CONTRACT_ENDED": return "hx-tag--warn";
    default: return ""; // maintenance and other routine reasons stay neutral
  }
}

const label = (v: string) => v.replace(/_/g, " ");

/** Client labels arrive as "Company (email)" — split for a two-line tenant cell. */
function splitClient(text: string): { name: string; email: string | null } {
  const m = text.match(/^(.*)\s\(([^()]+@[^()]+)\)$/);
  return m ? { name: m[1], email: m[2] } : { name: text, email: null };
}

function fmt(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  // Deterministic UTC output: identical on server and client, so hydration
  // never mismatches on timestamp text.
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** Whole days since a timestamp, from ISO math only (hydration-safe). */
function daysSince(ts: string | null): number | null {
  if (!ts) return null;
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

const ACTIVITY_VERB: Record<string, { verb: string; ok: boolean }> = {
  SERVICE_SUSPENDED: { verb: "suspended", ok: true },
  SERVICE_RESUMED: { verb: "resumed", ok: true },
  SERVICE_TOKEN_ROTATED: { verb: "rotated status token for", ok: true },
  SERVICE_SUSPEND_FAILED: { verb: "tried to suspend", ok: false },
  SERVICE_RESUME_FAILED: { verb: "tried to resume", ok: false },
  SERVICE_TOKEN_ROTATE_FAILED: { verb: "tried to rotate token for", ok: false },
};

export default function ApplicationSuspensionSection({ systems, systemsUnavailable, clients, isAdmin, activity, actorLabel }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // One dialog at a time: what is being done to which service.
  const [pending, setPending] = useState<{ kind: "suspend" | "resume" | "token"; system: SystemWithSuspension } | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [typed, setTyped] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const [tokenSystem, setTokenSystem] = useState<SystemWithSuspension | null>(null);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);

  // Phones show a compact list; each service expands to show its details and controls.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const tenantOf = (s: SystemWithSuspension) =>
    splitClient(clients.find((c) => c.id === s.client_id)?.label || s.client_id);

  function open(kind: "suspend" | "resume" | "token", system: SystemWithSuspension) {
    setPending({ kind, system });
    setReason("");
    setNote("");
    setTyped("");
    setAcknowledged(false);
    setDialogError(null);
  }

  function close() {
    if (busy) return;
    setPending(null);
  }

  async function confirmSuspend(e: React.FormEvent) {
    e.preventDefault();
    if (!pending || pending.kind !== "suspend") return;
    const sys = pending.system;
    setBusy(true);
    setDialogError(null);
    const res = await suspendApplication(sys.id, reason, note.trim());
    setBusy(false);
    if (!res.ok) {
      setDialogError(`${res.error || "Suspension failed"}. The failed attempt was recorded.`);
      return;
    }
    setPending(null);
    setError(null);
    setNotice(`${sys.name} is suspended. Recorded as ${actorLabel} at ${fmt(new Date().toISOString())}.`);
    router.refresh();
  }

  async function confirmResume(e: React.FormEvent) {
    e.preventDefault();
    if (!pending || pending.kind !== "resume") return;
    const sys = pending.system;
    setBusy(true);
    setDialogError(null);
    const res = await resumeApplication(sys.id, note.trim());
    setBusy(false);
    if (!res.ok) {
      setDialogError(`${res.error || "Resume failed"}. The failed attempt was recorded.`);
      return;
    }
    setPending(null);
    setError(null);
    setNotice(`${sys.name} is live again. Recorded as ${actorLabel} at ${fmt(new Date().toISOString())}.`);
    router.refresh();
  }

  async function confirmToken(e: React.FormEvent) {
    e.preventDefault();
    if (!pending || pending.kind !== "token") return;
    const sys = pending.system;
    setBusy(true);
    setDialogError(null);
    const res = await generateSystemStatusToken(sys.id);
    setBusy(false);
    if (res.error || !res.token) {
      setDialogError(`${res.error || "Token rotation failed"}. The failed attempt was recorded.`);
      return;
    }
    setPending(null);
    setGeneratedToken(res.token);
    setTokenSystem(sys);
    setTokenCopied(false);
    setError(null);
    setNotice(`Status token rotated for ${sys.name}. Recorded as ${actorLabel}.`);
    router.refresh();
  }

  const suspendedCount = systems.filter((s) => s.status === "suspended").length;
  const liveCount = systems.filter((s) => s.status === "live").length;
  const total = systems.length;
  const share = (n: number) => (total ? `${(n / total) * 100}%` : "0%");

  // Problems first: suspended, then maintenance / in build / other, then live; A-Z within each.
  const ordered = useMemo(() => {
    const rank: Record<StateKind, number> = { down: 0, warn: 1, build: 2, idle: 3, live: 4 };
    return [...systems].sort(
      (a, b) => rank[stateKind(a.status)] - rank[stateKind(b.status)] || a.name.localeCompare(b.name)
    );
  }, [systems]);
  const attention = ordered.filter((s) => s.status !== "live");
  const kindCount = (k: StateKind) => systems.filter((s) => stateKind(s.status) === k).length;

  const noteOk = note.trim().length >= MIN_NOTE;
  const suspendReady = Boolean(reason) && noteOk && typed.trim().toUpperCase() === SUSPEND_WORD && !busy;
  const resumeReady = noteOk && acknowledged && !busy;
  const tokenReady = acknowledged && !busy;

  return (
    <section className="hx-svcs" aria-labelledby="hx-health-title">
      {/* ── Summary: overall health + what needs attention (cards below carry the per-service detail) ── */}
      <div className="hx-summary">
        <div className="hx-health">
          <h2 id="hx-health-title" className="hx-label">Service health</h2>
          {systemsUnavailable ? (
            <p className="hx-health-big">Status unavailable</p>
          ) : (
            <>
              <p className="hx-health-big">
                <b>{liveCount}</b> of {total} live
              </p>
              <div className="hx-segbar" role="img" aria-label={`${liveCount} live, ${suspendedCount} suspended, ${total - liveCount - suspendedCount} other`}>
                <span style={{ width: share(liveCount), background: "var(--hx-live)" }} />
                <span style={{ width: share(suspendedCount), background: "var(--hx-down)" }} />
                <span style={{ width: share(kindCount("warn")), background: "var(--hx-warn)" }} />
                <span style={{ width: share(kindCount("build") + kindCount("idle")), background: "var(--hx-build)" }} />
              </div>
            </>
          )}
        </div>
        <div className="hx-attn">
          <h2 className="hx-label">Needs attention</h2>
          {systemsUnavailable ? (
            <p className="hx-attn-none">
              The service list could not be loaded. <a href="/admin/operations/suspensions" className="ux-link">Retry</a>
            </p>
          ) : attention.length === 0 ? (
            <p className="hx-attn-none"><span className="hx-led hx-led--live" /> All {total} services are live.</p>
          ) : (
            <ul>
              {attention.map((s) => {
                const st = stateKind(s.status);
                const days = s.status === "suspended" ? daysSince(s.suspended_at) : null;
                return (
                  <li key={s.id}>
                    <a href={`#svc-${s.id}`} className={`hx-attn-item s-${st}`}>
                      <span className={`hx-led hx-led--${st}`} />
                      <b>{s.name}</b>
                      <span className="hx-attn-what">
                        {label(s.status)}
                        {days !== null && ` · ${days === 0 ? "today" : `${days}d`}`}
                        {s.status === "suspended" && s.suspension_reason && ` · ${label(s.suspension_reason).toLowerCase()}`}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {error && <p className="ux-alert ux-alert-error" role="alert">{error}</p>}
      {notice && <p className="ux-alert ux-alert-success" role="status">{notice}</p>}

      {/* ── Services ── */}
      <div className="hx-sechead">
        <h2 className="hx-label">Services</h2>
        <span>{systemsUnavailable ? "" : `${total} managed · `}times in UTC</span>
      </div>

      {systemsUnavailable ? (
        <p className="hx-panel hx-empty">
          ERR: system status unavailable — the data source could not be reached.{" "}
          <a href="/admin/operations/suspensions" className="ux-link">Retry</a>
        </p>
      ) : systems.length === 0 ? (
        <p className="hx-panel hx-empty">No managed systems provisioned.</p>
      ) : (
        <ul className="hx-grid">
          {ordered.map((s) => {
            const { name: tenant, email } = tenantOf(s);
            const st = stateKind(s.status);
            const isDown = s.status === "suspended";
            const resumedAfter = !isDown && s.resumed_at && s.suspended_at && s.resumed_at >= s.suspended_at;
            const isOpen = expanded.has(s.id);
            return (
              <li key={s.id} id={`svc-${s.id}`} className={`hx-card s-${st}${isOpen ? " is-open" : ""}`}>
                <div className="hx-card-head">
                  <span className={`hx-svc-icon hx-svc-icon--${st}`} aria-hidden="true"><Server size={16} /></span>
                  <div className="hx-card-title">
                    <Link href={`/admin/systems/${s.id}`} className="hx-svc-name" title={`${s.name} — open service details`}>{s.name}</Link>
                    <span className="hx-mono">sys_{s.id.replace(/-/g, "").slice(0, 10)}</span>
                  </div>
                  {st === "live" ? (
                    <span className="hx-livedot" title="Live"><span className="hx-led hx-led--live" /><span className="hx-sr">live</span></span>
                  ) : (
                    <span className={`hx-state hx-state--${st}`}>
                      <span className={`hx-led hx-led--${st}`} />
                      {label(s.status)}
                    </span>
                  )}
                  <button
                    type="button"
                    className="hx-expand"
                    aria-expanded={isOpen}
                    aria-controls={`svc-body-${s.id}`}
                    aria-label={`${isOpen ? "Hide" : "Show"} details for ${s.name}`}
                    onClick={() => toggle(s.id)}
                  >
                    <ChevronDown size={16} />
                  </button>
                </div>

                <div className="hx-card-body" id={`svc-body-${s.id}`}>
                  <div className="hx-tenant">
                    <b>{tenant}</b>
                    {email && <span className="hx-mono">{email}</span>}
                  </div>
                  <div className="hx-event">
                    {s.suspended_at ? (
                      <>
                        <span className="hx-event-top">
                          {isDown ? "Suspended" : "Last suspended"} {fmt(s.suspended_at)}
                          {s.suspension_reason && (
                            <span className={`hx-tag ${reasonTagClass(s.suspension_reason)}`}>{label(s.suspension_reason)}</span>
                          )}
                        </span>
                        {resumedAfter && <span className="hx-event-sub">resumed {fmt(s.resumed_at)}</span>}
                      </>
                    ) : (
                      <span className="hx-event-sub">Never suspended</span>
                    )}
                  </div>
                  {isAdmin && (
                    <div className="hx-actions">
                      <button
                        type="button"
                        className="hx-btn hx-btn--icon"
                        disabled={busy}
                        onClick={() => open("token", s)}
                        title="Rotate status token"
                        aria-label={`Rotate status token for ${s.name}`}
                      >
                        <KeyRound size={14} />
                      </button>
                      {isDown ? (
                        <button type="button" className="hx-btn hx-btn--go" disabled={busy} onClick={() => open("resume", s)}>
                          <Power size={13} /> Resume…
                        </button>
                      ) : (
                        <button type="button" className="hx-btn hx-btn--danger" disabled={busy} onClick={() => open("suspend", s)}>
                          <PowerOff size={13} /> Suspend…
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* ── Service activity: the audit trail for this page's controls ── */}
      <div className="hx-sechead">
        <h2 className="hx-label">Service activity</h2>
        <span>who · what · why · result</span>
      </div>
      <div className="hx-log" role="log" aria-label="Recent service actions">
        {!isAdmin ? (
          <p className="hx-log-empty">Service activity is visible to administrators.</p>
        ) : activity.length === 0 ? (
          <p className="hx-log-empty">No service actions recorded yet.</p>
        ) : (
          <ol>
            {activity.map((a) => {
              const v = ACTIVITY_VERB[a.action] ?? { verb: a.action, ok: true };
              return (
                <li key={a.id} className={v.ok ? undefined : "is-failed"}>
                  <time dateTime={a.at}>{fmt(a.at).replace(" UTC", "")}</time>
                  <span className="hx-log-line">
                    <b>{a.actor ?? "system"}</b> {v.verb} <b>{a.systemName}</b>
                    {a.reason && <span className="hx-log-why"> · {label(a.reason).toLowerCase()}</span>}
                    {a.note && <span className="hx-log-why"> · “{a.note}”</span>}
                  </span>
                  <span className={`hx-log-result ${v.ok ? "is-ok" : "is-bad"}`} title={a.error ?? undefined}>
                    {v.ok ? "ok" : "failed"}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* ── Confirm: suspend ── */}
      {pending?.kind === "suspend" && (
        <Dialog onClose={close} labelledBy="suspend-title" maxWidth={520} dismissible={!busy}>
          <form onSubmit={confirmSuspend} className="hx-confirm">
            <h2 id="suspend-title"><PowerOff size={18} aria-hidden="true" /> Suspend {pending.system.name}?</h2>
            <div className="hx-impact is-danger">
              <b><ShieldAlert size={14} aria-hidden="true" /> What happens</b>
              <ul>
                <li>The service&apos;s status endpoint reports <code>suspended</code>, so the app stops serving its users.</li>
                <li>{tenantOf(pending.system).name} sees a suspension notice in the SCH portal and protected client actions are blocked.</li>
                <li>Hosting, data and provider infrastructure keep running. Nothing is deleted, and you can resume at any time.</li>
              </ul>
            </div>
            <label className="ux-field">
              <span className="ux-label">Reason *</span>
              <select className="ux-select" value={reason} onChange={(e) => setReason(e.target.value)} required>
                <option value="" disabled>Choose a reason</option>
                {REASON_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </label>
            <label className="ux-field">
              <span className="ux-label">What happened and why *</span>
              <textarea
                className="ux-input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Invoice SCH-2026-0006 unpaid after final reminder"
                required
                minLength={MIN_NOTE}
              />
            </label>
            <label className="ux-field">
              <span className="ux-label">Type <code>{SUSPEND_WORD}</code> to confirm</span>
              <input
                className="ux-input hx-typed"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                aria-describedby="suspend-record"
              />
            </label>
            {dialogError && <p className="ux-alert ux-alert-error" role="alert">{dialogError}</p>}
            <p className="hx-record" id="suspend-record">Recorded in the audit log as <b>{actorLabel}</b>, with the reason, note and result.</p>
            <div className="ops-dialog-actions hx-confirm-actions">
              <button type="button" className="ux-button ux-button-secondary" onClick={close} disabled={busy}>Cancel</button>
              <button type="submit" className="ux-btn ux-btn--danger" disabled={!suspendReady}>
                {busy ? "Suspending…" : "Suspend service"}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {/* ── Confirm: resume ── */}
      {pending?.kind === "resume" && (
        <Dialog onClose={close} labelledBy="resume-title" maxWidth={520} dismissible={!busy}>
          <form onSubmit={confirmResume} className="hx-confirm">
            <h2 id="resume-title"><Power size={18} aria-hidden="true" /> Resume {pending.system.name}?</h2>
            <dl className="hx-facts">
              <div><dt>Suspended</dt><dd>{fmt(pending.system.suspended_at)}</dd></div>
              <div><dt>Reason</dt><dd>{pending.system.suspension_reason ? label(pending.system.suspension_reason) : "—"}</dd></div>
              {pending.system.suspension_note && <div className="is-wide"><dt>Note</dt><dd>{pending.system.suspension_note}</dd></div>}
            </dl>
            <div className="hx-impact">
              <b>What happens</b>
              <ul>
                <li>The status endpoint reports <code>live</code> and the app serves its users again immediately.</li>
                <li>The suspension notice is removed from {tenantOf(pending.system).name}&apos;s portal.</li>
              </ul>
            </div>
            <label className="ux-field">
              <span className="ux-label">Why is it being resumed? *</span>
              <textarea
                className="ux-input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Payment received, receipt SCH-R-0042"
                required
                minLength={MIN_NOTE}
              />
            </label>
            <label className="hx-check">
              <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
              <span>I have confirmed the reason for this suspension is resolved.</span>
            </label>
            {dialogError && <p className="ux-alert ux-alert-error" role="alert">{dialogError}</p>}
            <p className="hx-record">Recorded in the audit log as <b>{actorLabel}</b>, with your note and the result.</p>
            <div className="ops-dialog-actions hx-confirm-actions">
              <button type="button" className="ux-button ux-button-secondary" onClick={close} disabled={busy}>Cancel</button>
              <button type="submit" className="hx-btn hx-btn--go hx-btn--lg" disabled={!resumeReady}>
                {busy ? "Resuming…" : "Resume service"}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {/* ── Confirm: rotate token ── */}
      {pending?.kind === "token" && (
        <Dialog onClose={close} labelledBy="token-confirm-title" maxWidth={520} dismissible={!busy}>
          <form onSubmit={confirmToken} className="hx-confirm">
            <h2 id="token-confirm-title"><KeyRound size={18} aria-hidden="true" /> Rotate status token for {pending.system.name}?</h2>
            <div className="hx-impact is-warn">
              <b>What happens</b>
              <ul>
                <li>The current token stops working immediately.</li>
                <li>The app&apos;s status checks fail until its server environment is updated with the new token.</li>
                <li>The new token is shown once. Have the app&apos;s environment settings open before you continue.</li>
              </ul>
            </div>
            <label className="hx-check">
              <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
              <span>I can update the app&apos;s environment now.</span>
            </label>
            {dialogError && <p className="ux-alert ux-alert-error" role="alert">{dialogError}</p>}
            <p className="hx-record">Recorded in the audit log as <b>{actorLabel}</b>. The token itself is never logged.</p>
            <div className="ops-dialog-actions hx-confirm-actions">
              <button type="button" className="ux-button ux-button-secondary" onClick={close} disabled={busy}>Cancel</button>
              <button type="submit" className="ux-button" disabled={!tokenReady}>
                {busy ? "Rotating…" : "Rotate token"}
              </button>
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
            <pre className="hx-token">{generatedToken}</pre>
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
          <div className="ops-dialog-actions" style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
            <button type="button" className="ux-button ux-button-secondary" onClick={() => { setTokenSystem(null); setGeneratedToken(null); }}>Done</button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
