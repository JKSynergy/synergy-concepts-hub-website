"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Copy, Check } from "lucide-react";
import { StatusMark, type Tone } from "@/components/ux/primitives";
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
            <button type="button" className="ux-button ux-button-secondary" onClick={onGenerateToken} disabled={busy}>
              <KeyRound size={14} /> {busy ? "Generating…" : tokenConfigured ? "Rotate Token" : "Generate Token"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
