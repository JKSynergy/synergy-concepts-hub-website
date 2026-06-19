"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Mail, ArrowLeft } from "lucide-react";
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
        setMessage({ type: "err", text: error.message });
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
    <main className="login-split">
      <section className="login-right" style={{ width: "100%" }}>
        <div className="login-glass-card login-fade-in mx-auto max-w-md">
          <div className="mb-7 text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-sch-blue">
              Secure Portal
            </p>
            <h1 className="font-display mt-2 text-[1.65rem] font-bold text-sch-white">
              Reset password
            </h1>
            <p className="mt-1.5 text-sm text-sch-muted">
              Invited but never finished setup? We&apos;ll email you a link to set a
              password.
            </p>
          </div>

          {message && (
            <div
              className={`mb-5 rounded-xl border p-3 text-sm ${
                message.type === "ok"
                  ? "border-green-500/25 bg-green-500/10 text-green-300"
                  : "border-red-500/25 bg-red-500/10 text-red-300"
              }`}
            >
              {message.text}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="block text-[11px] font-semibold uppercase tracking-wide text-sch-muted"
              >
                Email address
              </label>
              <div className="relative mt-1.5">
                <Mail
                  size={16}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sch-muted/60"
                />
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="login-input pl-10"
                />
              </div>
            </div>

            <button type="submit" disabled={loading} className="login-btn group">
              {loading ? "Sending..." : "Send reset link"}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link href="/login" className="login-link inline-flex items-center gap-1.5 text-xs">
              <ArrowLeft size={13} />
              Back to sign in
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
