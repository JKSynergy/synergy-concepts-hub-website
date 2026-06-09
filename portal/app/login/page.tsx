"use client";

import { useState, useMemo, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { SCHLoaderOverlay } from "@/components/sch-loader";
import {
  Mail,
  Lock,
  ArrowLeft,
  BarChart3,
  FolderKanban,
  Receipt,
  CalendarDays,
  TrendingUp,
  Activity,
} from "lucide-react";

function Particles() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const particles = useMemo(() => {
    return Array.from({ length: 24 }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      delay: `${Math.random() * 15}s`,
      duration: `${12 + Math.random() * 18}s`,
      size: 2 + Math.random() * 3,
      opacity: 0.25 + Math.random() * 0.5,
    }));
  }, []);

  if (!mounted) return null;

  return (
    <div className="login-particles" aria-hidden="true">
      {particles.map((p) => (
        <span
          key={p.id}
          className="login-particle"
          style={{
            left: p.left,
            animationDelay: p.delay,
            animationDuration: p.duration,
            width: p.size,
            height: p.size,
            opacity: p.opacity,
          }}
        />
      ))}
    </div>
  );
}

function PreviewCard({
  icon: Icon,
  title,
  value,
  sub,
  trend,
  delayClass,
  className = "",
}: {
  icon: React.ElementType;
  title: string;
  value: string;
  sub: string;
  trend?: string;
  delayClass: string;
  className?: string;
}) {
  return (
    <div
      className={`login-preview-card login-fade-in ${delayClass} ${className}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-sch-blue/10 text-sch-blue">
            <Icon size={18} strokeWidth={1.8} />
          </div>
          <span className="text-xs font-medium text-sch-muted">{title}</span>
        </div>
        {trend && (
          <span className="flex items-center gap-0.5 text-[10px] font-medium text-emerald-400">
            <TrendingUp size={10} strokeWidth={2} />
            {trend}
          </span>
        )}
      </div>
      <div className="mt-3">
        <span className="font-display text-xl font-bold text-sch-white">{value}</span>
        <p className="mt-0.5 text-[11px] text-sch-muted">{sub}</p>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full bg-gradient-to-r from-sch-blue to-sch-blue/50"
          style={{ width: "72%" }}
        />
      </div>
    </div>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [redirectTo, setRedirectTo] = useState<string | null>(null);
  const router = useRouter();

  // Surface OAuth errors returned to /login?error=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthErr = params.get("error");
    if (oauthErr) {
      setError(decodeURIComponent(oauthErr));
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Navigate after the overlay has rendered so the spinner stays visible
  // until the destination page fully loads.
  useEffect(() => {
    if (redirectTo) {
      const t = setTimeout(() => {
        router.push(redirectTo);
        router.refresh();
      }, 300);
      return () => clearTimeout(t);
    }
  }, [redirectTo, router]);

  async function handleGoogleSignIn() {
    setError("");
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (oauthError) {
      setError(oauthError.message);
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
      setError(signInError.message);
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
      const target = role === "admin" || role === "staff" ? "/admin" : "/client";
      // Prefetch destination, then show the success loader before navigating.
      router.prefetch(target);
      setRedirectTo(target);
      return;
    }

    setLoading(false);
  }

  return (
    <>
      {redirectTo && (
        <SCHLoaderOverlay
          label="Welcome back"
          autoCompleteMs={0}
        />
      )}
      <main className="login-split">
      {/* ─── Left Side ─── */}
      <section className="login-left relative hidden lg:flex">
        <div className="login-glow-orb login-glow-orb--1" />
        <div className="login-glow-orb login-glow-orb--2" />
        <Particles />

        <div className="relative z-10 mx-auto w-full max-w-lg">
          {/* Logo */}
          <div className="login-fade-in mb-10 flex items-center gap-3.5">
            <img
              src="/images/Website%20Logo%202.png"
              alt="SCH Logo"
              width={52}
              height={52}
              className="h-[52px] w-[52px] rounded-xl object-contain"
              onError={(e) => {
                const target = e.currentTarget;
                target.style.display = "none";
                const fallback = target.nextElementSibling as HTMLElement;
                if (fallback) fallback.style.display = "flex";
              }}
            />
            <div
              className="hidden h-[52px] w-[52px] items-center justify-center rounded-xl font-display text-lg font-extrabold text-white"
              style={{
                background:
                  "linear-gradient(135deg, var(--sch-blue), var(--sch-orange))",
              }}
            >
              SC
            </div>
            <div>
              <p className="font-display text-base font-bold tracking-tight text-sch-white">
                Synergy Concepts Hub
              </p>
              <p className="font-mono text-[10px] uppercase tracking-widest text-sch-blue">
                Digital Excellence
              </p>
            </div>
          </div>

          {/* Headline */}
          <div className="login-dash login-fade-in login-fade-in-delay-1 mb-6" />
          <h1 className="login-fade-in login-fade-in-delay-2 font-display text-[2.6rem] font-bold leading-[1.15] tracking-tight text-sch-white">
            Building Africa&apos;s
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sch-blue to-sch-blue/70">
              Next Digital Experiences
            </span>
          </h1>
          <p className="login-fade-in login-fade-in-delay-3 mt-5 max-w-sm text-[15px] leading-relaxed text-sch-muted">
            Access your projects, invoices, bookings and digital services.
          </p>

          {/* Floating preview cards */}
          <div className="login-fade-in login-fade-in-delay-4 mt-10 grid grid-cols-2 gap-4">
            <PreviewCard
              icon={FolderKanban}
              title="Active Projects"
              value="12"
              sub="3 pending review"
              trend="+8%"
              delayClass="login-fade-in-delay-4"
              className="animate-float-slow"
            />
            <PreviewCard
              icon={Receipt}
              title="Invoices"
              value="UGX 24M"
              sub="2 outstanding"
              trend="+12%"
              delayClass="login-fade-in-delay-5"
              className="animate-float-medium mt-6"
            />
          </div>

          <div className="login-fade-in login-fade-in-delay-5 mt-4 max-w-[220px]">
            <div className="login-preview-card animate-float-fast">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-sch-orange/10 text-sch-orange">
                  <CalendarDays size={18} strokeWidth={1.8} />
                </div>
                <span className="text-xs font-medium text-sch-muted">Upcoming Booking</span>
              </div>
              <p className="mt-2 font-display text-sm font-semibold text-sch-white">
                Brand Strategy Session
              </p>
              <p className="mt-0.5 text-[11px] text-sch-muted">Tomorrow, 10:00 AM EAT</p>
              <div className="mt-2.5 flex items-center gap-1.5">
                <Activity size={12} className="text-emerald-400" />
                <span className="text-[10px] font-medium text-emerald-400">Confirmed</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Right Side ─── */}
      <section className="login-right">
        {/* Mobile-only logo at top */}
        <div className="absolute top-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2.5 lg:hidden">
          <img
            src="/images/Website%20Logo%202.png"
            alt="SCH Logo"
            width={36}
            height={36}
            className="h-9 w-9 rounded-lg object-contain"
            onError={(e) => {
              const target = e.currentTarget;
              target.style.display = "none";
              const fallback = target.nextElementSibling as HTMLElement;
              if (fallback) fallback.style.display = "flex";
            }}
          />
          <div
            className="hidden h-9 w-9 items-center justify-center rounded-lg font-display text-sm font-extrabold text-white"
            style={{
              background:
                "linear-gradient(135deg, var(--sch-blue), var(--sch-orange))",
            }}
          >
            SC
          </div>
          <span className="font-display text-sm font-bold text-sch-white">
            Synergy Concepts Hub
          </span>
        </div>

        <div className="login-glass-card login-fade-in login-fade-in-delay-2">
          {/* Header */}
          <div className="mb-7 text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-sch-blue">
              Secure Portal
            </p>
            <h2 className="font-display mt-2 text-[1.65rem] font-bold text-sch-white">
              Welcome back
            </h2>
            <p className="mt-1.5 text-sm text-sch-muted">
              Sign in to access your dashboard
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-5 rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-300 backdrop-blur-sm">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="block text-[11px] font-semibold uppercase tracking-wide text-sch-muted"
              >
                Email Address
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
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="login-input pl-10"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-[11px] font-semibold uppercase tracking-wide text-sch-muted"
              >
                Password
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
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="login-input pl-10"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-sch-glass-border bg-white/5 text-sch-blue focus:ring-sch-blue/20"
                />
                <span className="text-xs text-sch-muted">Remember me</span>
              </label>
              <a
                href="#"
                className="text-xs font-medium text-sch-blue transition-colors hover:text-sch-white"
              >
                Forgot password?
              </a>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="login-btn group"
            >
              {loading ? (
                <>
                  <svg
                    className="h-4 w-4 animate-spin"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-sch-glass-border to-transparent" />
            <span className="text-[10px] uppercase tracking-widest text-sch-muted/60">
              Or continue with
            </span>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-sch-glass-border to-transparent" />
          </div>

          {/* Social / quick actions */}
          <div className="flex justify-center gap-3">
            <button type="button" onClick={handleGoogleSignIn} className="login-icon-btn" aria-label="Google sign in">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            </button>
            <a
              href="mailto:synergyconceptshub@gmail.com"
              className="login-icon-btn"
              aria-label="Contact support"
            >
              <Mail size={16} strokeWidth={1.6} />
            </a>
            <a
              href="https://synergyconceptshub.com"
              className="login-icon-btn"
              aria-label="Back to website"
            >
              <BarChart3 size={16} strokeWidth={1.6} />
            </a>
          </div>

          {/* Back link */}
          <div className="mt-6 text-center">
            <a
              href="https://synergyconceptshub.com"
              className="login-link inline-flex items-center gap-1.5 text-xs"
            >
              <ArrowLeft size={13} strokeWidth={1.6} />
              Back to website
            </a>
          </div>
        </div>
      </section>
      </main>
    </>
  );
}
