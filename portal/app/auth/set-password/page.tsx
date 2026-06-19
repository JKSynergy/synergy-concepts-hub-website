"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Lock, ArrowLeft } from "lucide-react";

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
        target = role === "admin" || role === "staff" ? "/admin" : "/client";
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
    <main className="login-split">
      <section className="login-right" style={{ width: "100%" }}>
        <div className="login-glass-card login-fade-in mx-auto max-w-md">
          <div className="mb-7 text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-sch-blue">
              Secure Portal
            </p>
            <h1 className="font-display mt-2 text-[1.65rem] font-bold text-sch-white">
              Create your password
            </h1>
            <p className="mt-1.5 text-sm text-sch-muted">
              Set a password to finish activating your account
            </p>
          </div>

          {checkingSession ? (
            <p className="text-center text-sm text-sch-muted">Loading...</p>
          ) : !hasSession ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-sch-muted">
                Open the invitation or password-reset link from your email first,
                then return here to choose a password.
              </p>
              <a href="/login" className="login-link inline-flex items-center gap-1.5 text-sm">
                <ArrowLeft size={14} />
                Back to sign in
              </a>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-5 rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-300">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label
                    htmlFor="password"
                    className="block text-[11px] font-semibold uppercase tracking-wide text-sch-muted"
                  >
                    New password
                  </label>
                  <div className="relative mt-1.5">
                    <Lock
                      size={16}
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sch-muted/60"
                    />
                    <input
                      id="password"
                      type="password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className="login-input pl-10"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="block text-[11px] font-semibold uppercase tracking-wide text-sch-muted"
                  >
                    Confirm password
                  </label>
                  <div className="relative mt-1.5">
                    <Lock
                      size={16}
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sch-muted/60"
                    />
                    <input
                      id="confirmPassword"
                      type="password"
                      required
                      minLength={8}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat password"
                      className="login-input pl-10"
                    />
                  </div>
                </div>

                <button type="submit" disabled={loading} className="login-btn group">
                  {loading ? "Saving..." : "Save password & continue"}
                </button>
              </form>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
