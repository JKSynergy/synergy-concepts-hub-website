"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AuthShell } from "@/components/ux/auth-shell";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(
    null
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/auth/callback?type=recovery`;

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });

      if (error) {
        setMessage({ type: "err", text: "Could not send the reset email. Please try again." });
        return;
      }

      setMessage({
        type: "ok",
        text: "If an account exists for that email, a reset link has been sent.",
      });
    } catch {
      setMessage({ type: "err", text: "Could not send reset email. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Reset your password" description="Enter your email and we will send you a link to choose a new password.">
      {message && (
        <div className={`ux-notice ${message.type === "ok" ? "ux-notice--ok" : "ux-notice--error"}`} role={message.type === "ok" ? "status" : "alert"}>
          {message.text}
        </div>
      )}
      <form onSubmit={handleSubmit} className="ux-stack">
        <label className="ux-field">
          <span>Email</span>
          <input id="email" type="email" required autoComplete="email" className="ux-input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <button type="submit" disabled={loading} className="ux-btn ux-btn--primary" style={{ width: "100%", minHeight: 42 }}>
          {loading ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <div className="ux-login-links">
        <Link href="/login">Back to sign in</Link>
      </div>
    </AuthShell>
  );
}
