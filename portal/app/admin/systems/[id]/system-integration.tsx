"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Copy, Check } from "lucide-react";
import { StatusMark, type Tone } from "@/components/ux/primitives";
import { Dialog } from "@/components/ux/dialog";
import { generateSystemStatusToken } from "@/lib/actions/system-status";
import SystemIdentity from "./system-identity";

interface Props {
  systemId: string;
  status: string;
  tokenConfigured: boolean;
  isAdmin: boolean;
}

const STATUS_TONE: Record<string, Tone> = {
  live: "success",
  suspended: "danger",
  maintenance_only: "warning",
};

export default function SystemIntegration({ systemId, status, tokenConfigured, isAdmin }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [envCopied, setEnvCopied] = useState(false);
  // Rotating a live token breaks the app's status checks until its environment is updated: confirm first.
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const statusEndpoint = `https://portal.synergyconceptshub.com/api/systems/${systemId}/status`;
  const envText = [
    `SCH_SYSTEM_ID=${systemId}`,
    `SCH_STATUS_ENDPOINT=${statusEndpoint}`,
    `SCH_STATUS_TOKEN=${generatedToken ?? ""}`,
    `SCH_STATUS_CACHE_TTL_SECONDS=30`,
  ].join("\n");

  async function onGenerateToken() {
    setBusy(true);
    setError(null);
    setGeneratedToken(null);
    const res = await generateSystemStatusToken(systemId);
    setBusy(false);
    if (res.error) {
      setError(res.error);
    } else if (res.token) {
      setGeneratedToken(res.token);
      router.refresh();
    }
  }

  function dismissToken() {
    setGeneratedToken(null);
    setEnvCopied(false);
  }

  const labelStyle = { fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em" } as const;

  return (
    <section style={{ padding: "1.5rem 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: "1.2rem" }}>Application Integration</h2>
        <StatusMark tone={tokenConfigured || generatedToken ? "success" : "neutral"}>
          {tokenConfigured || generatedToken ? "Token configured" : "Not configured"}
        </StatusMark>
      </div>
      <p style={{ margin: "0.65rem 0 0", maxWidth: "75ch" }}>
        Managed-application status enforcement. Configure the application environment with the values below.
      </p>

      <div className="ux-muted" style={{ marginTop: "0.9rem", fontSize: "0.825rem" }}>
        Service status: <StatusMark tone={STATUS_TONE[status] ?? "neutral"}>{status.replace(/_/g, " ")}</StatusMark>
      </div>

      <div style={{ marginTop: "1.25rem" }}>
        <SystemIdentity systemId={systemId} bare />
      </div>

      {error && <p className="ux-alert ux-alert-error" role="alert" style={{ marginTop: "1rem" }}>{error}</p>}

      <div style={{ marginTop: "1.25rem" }}>
        <div className="ux-muted" style={{ ...labelStyle, marginBottom: "0.5rem" }}>Environment variables</div>
        <pre style={{ margin: 0, padding: "0.75rem", background: "var(--ux-surface-2)", fontSize: "0.8rem", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-all", maxWidth: "60rem" }}>
{envText}
        </pre>
      </div>

      {generatedToken ? (
        <div style={{ marginTop: "0.9rem" }}>
          <p className="ux-alert ux-alert-warning" style={{ fontSize: "0.85rem", maxWidth: "60rem" }}>
            The status token is shown only once. Copy the environment variables now — the token will not be shown again after leaving this page.
          </p>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className="ux-button"
              onClick={() => {
                navigator.clipboard.writeText(envText).then(() => setEnvCopied(true)).catch(() => setEnvCopied(false));
              }}
            >
              {envCopied ? <Check size={14} /> : <Copy size={14} />} {envCopied ? "Copied" : "Copy Environment Variables"}
            </button>
            <button type="button" className="ux-button ux-button-secondary" onClick={dismissToken}>Done</button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: "0.9rem" }}>
          {tokenConfigured && (
            <p className="ux-muted" style={{ fontSize: "0.85rem", maxWidth: "60rem" }}>
              Status token configured. Generate a new token to create a fresh environment configuration.
            </p>
          )}
          {isAdmin && (
            <button
              type="button"
              className="ux-button ux-button-secondary"
              onClick={() => (tokenConfigured ? (setAcknowledged(false), setConfirmRotate(true)) : onGenerateToken())}
              disabled={busy}
            >
              <KeyRound size={14} /> {busy ? "Generating…" : tokenConfigured ? "Rotate Token" : "Generate Token"}
            </button>
          )}
        </div>
      )}
      {confirmRotate && (
        <Dialog onClose={() => !busy && setConfirmRotate(false)} labelledBy="rotate-token-title" maxWidth={520}>
          <div style={{ display: "grid", gap: "1rem" }}>
            <h2 id="rotate-token-title" style={{ margin: 0 }}><KeyRound size={18} style={{ verticalAlign: "-3px" }} /> Rotate the status token?</h2>
            <ul style={{ margin: 0, paddingLeft: "1.1rem", display: "grid", gap: "0.3rem", fontSize: "0.9rem" }}>
              <li>The current token stops working immediately.</li>
              <li>The app&apos;s status checks fail until its server environment is updated with the new token.</li>
              <li>The new token is shown once. Have the app&apos;s environment settings open before you continue.</li>
            </ul>
            <label style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start", fontSize: "0.9rem", cursor: "pointer" }}>
              <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} style={{ marginTop: "0.2rem" }} />
              <span>I can update the app&apos;s environment now.</span>
            </label>
            <p className="ux-muted" style={{ margin: 0, fontSize: "0.8rem" }}>Recorded in the audit log with your name. The token itself is never logged.</p>
            <div className="ops-dialog-actions" style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button type="button" className="ux-button ux-button-secondary" onClick={() => setConfirmRotate(false)} disabled={busy}>Cancel</button>
              <button
                type="button"
                className="ux-button"
                disabled={!acknowledged || busy}
                onClick={async () => { await onGenerateToken(); setConfirmRotate(false); }}
              >
                {busy ? "Rotating…" : "Rotate token"}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </section>
  );
}
