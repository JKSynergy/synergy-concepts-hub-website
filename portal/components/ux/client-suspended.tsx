"use client";

import Link from "next/link";

interface Props {
  systemName?: string | null;
}

export function ClientSuspendedPage({ systemName }: Props) {
  return (
    <div className="ux-page" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ maxWidth: "520px", textAlign: "center", padding: "2rem" }}>
        <h1 style={{ fontSize: "1.75rem", margin: "0 0 1rem", letterSpacing: "0.04em", textTransform: "uppercase" }}>
          Service Temporarily Suspended
        </h1>
        <p style={{ fontSize: "1rem", lineHeight: 1.6, margin: "0 0 1.5rem" }}>
          Access to {systemName ? <>the <strong>{systemName}</strong> service</> : "this service"} has been temporarily
          suspended because the account requires attention.
        </p>
        <p style={{ fontSize: "0.95rem", margin: "0 0 2rem" }}>
          Please contact Synergy Concepts Hub for assistance and to restore access.
        </p>
        <Link
          href="mailto:info@synergyconceptshub.com"
          className="ux-button"
        >
          Contact Synergy Concepts Hub
        </Link>
      </div>
    </div>
  );
}
