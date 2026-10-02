"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/ux/auth-shell";
import { landingFor } from "@/lib/security/roles";

export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function checkSession() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setHasSession(!!user);
      setCheckingSession(false);
    }
    checkSession();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
        data: { password_set: true },
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      let target = "/client";
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();
        const role = profile?.role ?? "client";
        target = landingFor(role);
      }

      router.push(target);
      router.refresh();
    } catch {
      setError("Could not save password. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Set your password" description="Choose a password to finish setting up your account.">
      {checkingSession ? (
        <p className="ux-muted" role="status">Checking your invitation…</p>
      ) : !hasSession ? (
        <>
          <div className="ux-notice ux-notice--error" role="alert">
            This link is invalid or has expired. Ask Synergy Concepts Hub for a new invitation.
          </div>
          <div className="ux-login-links">
            <Link href="/login">Back to sign in</Link>
          </div>
        </>
      ) : (
        <>
          {error && (
            <div className="ux-notice ux-notice--error" role="alert">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="ux-stack">
            <label className="ux-field">
              <span>New password</span>
              <input id="password" type="password" required minLength={8} autoComplete="new-password" className="ux-input" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <label className="ux-field">
              <span>Confirm password</span>
              <input id="confirm-password" type="password" required minLength={8} autoComplete="new-password" className="ux-input" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </label>
            <button type="submit" disabled={loading} className="ux-btn ux-btn--primary" style={{ width: "100%", minHeight: 42 }}>
              {loading ? "Saving…" : "Save password"}
            </button>
          </form>
        </>
      )}
    </AuthShell>
  );
}
