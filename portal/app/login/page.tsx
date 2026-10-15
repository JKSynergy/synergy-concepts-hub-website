"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import "../ux.css";
import { LoginConsole, LoginFootnote, LoginGrid } from "@/components/ux/login-console";
import { landingFor, resolvePostLoginRedirect } from "@/lib/security/roles";

// Fixed, safe messages. Nothing from the URL or from a provider is ever shown.
const ERROR_MESSAGES: Record<string, string> = {
  unavailable: "Sign-in is temporarily unavailable. Please try again shortly.",
  account_disabled: "This account is disabled. Please contact Synergy Concepts Hub.",
  auth_failed: "That sign-in link is invalid or has expired. Please try again.",
};
const GENERIC_SIGN_IN_ERROR = "Incorrect email or password.";
const GENERIC_AUTH_ERROR = "We couldn't sign you in. Please try again.";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Surface OAuth errors returned to /login?error=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthErr = params.get("error");
    if (oauthErr) {
      setError(ERROR_MESSAGES[oauthErr] ?? GENERIC_AUTH_ERROR);
      params.delete("error");
      const qs = params.toString();
      window.history.replaceState({}, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
    }
  }, []);

  // Handle Supabase implicit-flow invite/recovery links that land on /login
  // with #access_token=... hash (happens when /auth/callback is not in the
  // Supabase redirect allowlist and Supabase falls back to the Site URL).
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash || !hash.includes("access_token")) return;

    const hashParams = new URLSearchParams(hash.slice(1));
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    const type = hashParams.get("type");

    if (!accessToken || !refreshToken) return;

    window.history.replaceState({}, "", window.location.pathname);

    const supabase = createClient();
    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error: sessionError }) => {
        if (sessionError) {
          setError(ERROR_MESSAGES.auth_failed);
          return;
        }
        if (type === "invite" || type === "recovery" || type === "signup") {
          router.push("/auth/set-password");
        } else {
          router.push("/client");
        }
      });
  }, [router]);

  async function handleGoogleSignIn() {
    setError("");
    const supabase = createClient();
    const nextParam = new URLSearchParams(window.location.search).get("next");
    const callbackUrl = nextParam
      ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextParam)}`
      : `${window.location.origin}/auth/callback`;
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl,
      },
    });
    if (oauthError) {
      setError(GENERIC_AUTH_ERROR);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(GENERIC_SIGN_IN_ERROR);
      setLoading(false);
      return;
    }

    if (data.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();

      const role = profile?.role ?? "client";
      const nextParam = new URLSearchParams(window.location.search).get("next");
      const target = resolvePostLoginRedirect(role, nextParam);
      // Go straight in. No artificial delay.
      router.push(target);
      router.refresh();
      return;
    }

    setLoading(false);
  }

  return (
    <main className="ux ux-login">
      <section className="ux-login-brand">
        <LoginGrid />
        <div className="ux-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/Website%20Logo%202.png" alt="" />
          <div>
            <b>Synergy</b>
            <span>Concepts Hub</span>
          </div>
        </div>
        <LoginConsole />
        <div>
          <hr />
          <h2>
            Client and business
            <br />
            operations, in one place.
          </h2>
          <p>
            Manage clients, projects, systems, finance and
            <br />
            operations for Synergy Concepts Hub and its clients.
          </p>
          <LoginFootnote />
        </div>
      </section>

      <section className="ux-login-form">
        <div>
          <h1>Sign in</h1>
          <p className="ux-muted" style={{ margin: "8px 0 28px" }}>
            First time here? Use the link in your invitation email to set a password, then sign in.
          </p>

          {error && (
            <div className="ux-notice ux-notice--error" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="ux-stack">
            <label className="ux-field">
              <span>Email</span>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                className="ux-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>

            <label className="ux-field">
              <span>Password</span>
              <div className="ux-pwrow">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  className="ux-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button type="button" onClick={() => setShowPassword((v) => !v)} aria-pressed={showPassword}>
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </label>

            <button type="submit" disabled={loading} className="ux-btn ux-btn--primary" style={{ width: "100%", minHeight: 42 }}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="ux-login-links">
            <Link href="/forgot-password">Forgot password?</Link>
            <button
              type="button"
              onClick={handleGoogleSignIn}
              style={{ background: "none", border: 0, padding: 0, cursor: "pointer", font: "inherit", color: "var(--ux-blue)" }}
            >
              Continue with Google
            </button>
          </div>

          <p style={{ marginTop: 36, fontSize: 13 }}>
            <a href={process.env.NEXT_PUBLIC_WEBSITE_URL || "/"} className="ux-muted" style={{ textDecoration: "underline" }}>
              Back to website
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}
