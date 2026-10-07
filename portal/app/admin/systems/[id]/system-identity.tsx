"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

interface Props {
  systemId: string;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="ux-button ux-button-secondary"
      style={{ whiteSpace: "nowrap", padding: "0.2rem 0.6rem", fontSize: "0.8rem" }}
      onClick={() => {
        navigator.clipboard.writeText(value).then(() => setCopied(true)).catch(() => setCopied(false));
      }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
    </button>
  );
}

export default function SystemIdentity({ systemId }: Props) {
  const statusEndpoint = `https://portal.synergyconceptshub.com/api/systems/${systemId}/status`;
  const labelStyle = { fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em" } as const;

  return (
    <div style={{ marginTop: "1.25rem", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(8rem, auto) 1fr auto", gap: "0.6rem 1rem", alignItems: "center", maxWidth: "60rem" }}>
        <div className="ux-muted" style={labelStyle}>System ID</div>
        <code style={{ fontSize: "0.85rem" }}>{systemId}</code>
        <CopyButton value={systemId} />
        <div className="ux-muted" style={labelStyle}>Status endpoint</div>
        <code style={{ fontSize: "0.85rem", wordBreak: "break-all" }}>{statusEndpoint}</code>
        <CopyButton value={statusEndpoint} />
      </div>
    </div>
  );
}
