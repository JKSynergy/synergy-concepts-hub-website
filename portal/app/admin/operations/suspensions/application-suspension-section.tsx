"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusMark, type Tone } from "@/components/ux/primitives";
import { Dialog } from "@/components/ux/dialog";
import { suspendApplication, resumeApplication } from "@/lib/actions/application-suspension";
import { Power, PowerOff } from "lucide-react";

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

function statusTone(status: string): Tone {
  switch (status) {
    case "suspended": return "danger";
    case "live": return "success";
    case "maintenance_only": return "warning";
    default: return "neutral";
  }
}

function fmt(ts: string | null): string {
  return ts ? new Date(ts).toLocaleString() : "—";
}

export default function ApplicationSuspensionSection({ systems, clients, isAdmin }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeSystem, setActiveSystem] = useState<SystemWithSuspension | null>(null);
  const [reason, setReason] = useState("NON_PAYMENT");
  const [note, setNote] = useState("");

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

  const suspendedCount = systems.filter((s) => s.status === "suspended").length;

  return (
    <div className="ux-card" style={{ marginBottom: "1.5rem" }}>
      <div className="ux-card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.125rem" }}>Application Access Control</h2>
          <p className="ux-muted" style={{ margin: "0.25rem 0 0", fontSize: "0.85rem" }}>
            Suspend or resume client application access. Provider infrastructure is not affected.
          </p>
        </div>
        <StatusMark tone={suspendedCount > 0 ? "danger" : "success"}>
          {suspendedCount} suspended
        </StatusMark>
      </div>

      {error && <p className="ux-alert ux-alert-error" role="alert" style={{ margin: "1rem" }}>{error}</p>}
      {notice && <p className="ux-alert ux-alert-success" role="status" style={{ margin: "1rem" }}>{notice}</p>}

      <div className="ux-tablewrap">
        <table className="ux-table">
          <thead>
            <tr><th>Client</th><th>System</th><th>Status</th><th>Suspended</th><th>Reason</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {systems.length === 0 ? (
              <tr><td colSpan={6} className="ux-muted">No systems available.</td></tr>
            ) : (
              systems.map((s) => {
                const client = clients.find((c) => c.id === s.client_id);
                return (
                  <tr key={s.id}>
                    <td>{client?.label || s.client_id}</td>
                    <td>{s.name}</td>
                    <td><StatusMark tone={statusTone(s.status)}>{s.status}</StatusMark></td>
                    <td>{fmt(s.suspended_at)}</td>
                    <td>{s.suspension_reason ? s.suspension_reason.replace(/_/g, " ") : "—"}</td>
                    <td>
                      {isAdmin && (
                        s.status === "suspended" ? (
                          <button
                            className="ux-button ux-button-secondary"
                            disabled={busy}
                            onClick={() => { setActiveSystem(s); setNote(s.suspension_note || ""); }}
                          >
                            <Power size={14} /> Resume
                          </button>
                        ) : (
                          <button
                            className="ux-button ux-button-secondary"
                            disabled={busy}
                            onClick={() => { setActiveSystem(s); setReason("NON_PAYMENT"); setNote(""); }}
                          >
                            <PowerOff size={14} /> Suspend
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {activeSystem && activeSystem.status !== "suspended" && (
        <Dialog onClose={() => setActiveSystem(null)} labelledBy="suspend-title" maxWidth={480}>
          <h2 id="suspend-title"><PowerOff size={18} style={{ verticalAlign: "-3px" }} /> Suspend application access</h2>
          <p className="ux-muted">
            System: <strong>{activeSystem.name}</strong><br />
            Client: {clients.find((c) => c.id === activeSystem.client_id)?.label || activeSystem.client_id}
          </p>
          <p className="ux-muted" style={{ fontSize: "0.85rem" }}>
            This will block the client from using the application. Railway, Vercel and other provider infrastructure will continue running.
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
              <button type="submit" className="ux-button" disabled={busy || !reason}>Suspend access</button>
            </div>
          </form>
        </Dialog>
      )}

      {activeSystem && activeSystem.status === "suspended" && (
        <Dialog onClose={() => setActiveSystem(null)} labelledBy="resume-title" maxWidth={480}>
          <h2 id="resume-title"><Power size={18} style={{ verticalAlign: "-3px" }} /> Resume application access</h2>
          <p className="ux-muted">
            System: <strong>{activeSystem.name}</strong><br />
            Suspended: {fmt(activeSystem.suspended_at)}
            {activeSystem.suspension_reason ? <> · Reason: {activeSystem.suspension_reason.replace(/_/g, " ")}</> : null}
          </p>
          <p className="ux-muted" style={{ fontSize: "0.85rem" }}>
            Client access will be restored. No provider infrastructure is modified.
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
              <button type="button" className="ux-button" onClick={onResume} disabled={busy}>Resume access</button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
