"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import "../ux.css";
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
        {/* Decorative systems artwork — non-interactive, hidden from AT. */}
        <svg
          className="ux-login-art"
          viewBox="0 0 620 880"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
          focusable="false"
          fill="none"
        >
          {/* faint grid fragment, upper right */}
          <g stroke="#8FA6C6" strokeOpacity="0.09" strokeWidth="1">
            <path d="M452 88v118M492 88v118M532 88v118M572 88v118" />
            <path d="M432 108h190M432 148h190M432 188h190" />
          </g>

          {/* architectural rail, right edge */}
          <g stroke="#8FA6C6" strokeOpacity="0.13" strokeWidth="1">
            <path d="M596 150v330" />
            <path d="M590 190h12M590 250h12M590 310h12M590 370h12M590 430h12" />
          </g>

          {/* tilted planes, center-lower */}
          <g stroke="#8FA6C6" strokeOpacity="0.15" strokeWidth="1">
            <path d="M298 552l152-62 118 52-152 62z" />
            <path d="M330 554l120-49 86 38-120 49z" strokeOpacity="0.09" />
          </g>

          {/* dashed connector, left */}
          <path d="M170 378h116" stroke="#8FA6C6" strokeOpacity="0.14" strokeWidth="1" strokeDasharray="2 6" />
          <circle cx="170" cy="378" r="2.5" stroke="#A9BED9" strokeOpacity="0.4" strokeWidth="1" />
          <circle cx="286" cy="378" r="2.5" stroke="#A9BED9" strokeOpacity="0.4" strokeWidth="1" />

          {/* network constellation, center/right */}
          <g stroke="#8FA6C6" strokeOpacity="0.18" strokeWidth="1">
            <path d="M310 258l110-50M420 208l96 60M516 268l50 54M420 208l-36 128M384 336l114 52M498 388l68-66M384 336l-48 92M498 388l-54 82M336 428l108 42M444 470l130-18M516 268l-18 120" />
          </g>
          <g stroke="#A9BED9" strokeOpacity="0.45" strokeWidth="1">
            <circle cx="310" cy="258" r="3" />
            <circle cx="420" cy="208" r="3" />
            <circle cx="566" cy="322" r="3" />
            <circle cx="384" cy="336" r="3" />
            <circle cx="336" cy="428" r="3" />
            <circle cx="444" cy="470" r="3" />
            <circle cx="574" cy="452" r="3" />
          </g>
          {/* accent nodes — restrained orange/blue */}
          <circle cx="516" cy="268" r="4" fill="#ED8C22" fillOpacity="0.8" />
          <circle cx="516" cy="268" r="9" stroke="#ED8C22" strokeOpacity="0.28" strokeWidth="1" />
          <circle cx="498" cy="388" r="3.5" fill="#4EA3E3" fillOpacity="0.75" />
          <circle cx="310" cy="258" r="7" stroke="#ED8C22" strokeOpacity="0.22" strokeWidth="1" />

          {/* data points on edges */}
          <g fill="#8FA6C6" fillOpacity="0.32">
            <rect x="363" y="231" width="3" height="3" />
            <rect x="466" y="236" width="3" height="3" />
            <rect x="439" y="360" width="3" height="3" />
            <rect x="508" y="459" width="3" height="3" />
          </g>

          {/* faint drift lines */}
          <g stroke="#8FA6C6" strokeOpacity="0.08" strokeWidth="1">
            <path d="M70 640 250 486" />
            <path d="M250 486h60" />
            {/* faint ledger rows */}
            <path d="M330 620h150M330 634h210M330 648h96" strokeOpacity="0.09" />
          </g>
        </svg>
        <div className="ux-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/Website%20Logo%202.png" alt="" />
          <div>
            <b>Synergy</b>
            <span>Concepts Hub</span>
          </div>
        </div>
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
