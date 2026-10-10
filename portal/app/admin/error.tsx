"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Error boundary for unexpected rendering/server errors inside /admin.
 * Per-section data failures are handled inline by each page (Unavailable
 * states); this catches anything that escapes them — without exposing
 * stack traces or internal details to the user.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Admin area error:", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="ux-page">
      <h1 className="ux-ops-sec-title">Something went wrong</h1>
      <p className="ux-ops-empty">
        This page could not be loaded. Try again, or return to the dashboard.
      </p>
      <p>
        <button className="ux-textbtn" onClick={reset}>Retry</button>
        {" · "}
        <Link href="/admin" className="ux-link">Dashboard</Link>
      </p>
    </div>
  );
}
