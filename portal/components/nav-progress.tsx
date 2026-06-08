"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

/* ─────────────────────────────────────────────────────────────
   Top navigation progress bar (Linear / Stripe / Vercel style)
   - Triggered on client-side navigation start via startNavProgress()
   - Completes automatically when the pathname changes
   - SCH brand gradient + soft glow, GPU-friendly transforms
   ───────────────────────────────────────────────────────────── */

let token = 0;
const listeners = new Set<() => void>();

/** Call when a client-side navigation begins (see NavLink). */
export function startNavProgress() {
  token += 1;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
const getToken = () => token;
const getServerToken = () => 0;

type Phase = "idle" | "loading" | "done";

export function NavProgress() {
  const tok = useSyncExternalStore(subscribe, getToken, getServerToken);
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("idle");

  // Navigation started
  useEffect(() => {
    if (tok > 0) setPhase("loading");
  }, [tok]);

  // Pathname changed -> navigation finished
  useEffect(() => {
    setPhase((p) => (p === "loading" ? "done" : p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // After completing, fade out and reset
  useEffect(() => {
    if (phase === "done") {
      const t = setTimeout(() => setPhase("idle"), 400);
      return () => clearTimeout(t);
    }
  }, [phase]);

  const isLoading = phase === "loading";
  const isDone = phase === "done";

  return (
    <div className="nav-progress" aria-hidden="true">
      <div
        className={`nav-progress__bar ${isLoading ? "is-loading" : ""} ${
          isDone ? "is-done" : ""
        }`}
      />
      <style jsx>{`
        .nav-progress {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          z-index: 100;
          pointer-events: none;
        }
        .nav-progress__bar {
          height: 100%;
          width: 0%;
          transform-origin: 0 50%;
          border-radius: 0 3px 3px 0;
          background: linear-gradient(90deg, #0ea5e9, #38bdf8 60%, #f59e0b);
          box-shadow: 0 0 10px rgba(14, 165, 233, 0.6),
            0 0 4px rgba(14, 165, 233, 0.8);
          opacity: 0;
          transition: width 0.2s ease, opacity 0.3s ease;
        }
        /* Simulated progress: ease quickly to ~90% then crawl */
        .nav-progress__bar.is-loading {
          opacity: 1;
          width: 90%;
          transition: width 10s cubic-bezier(0.1, 0.7, 0.1, 1), opacity 0.2s ease;
        }
        .nav-progress__bar.is-done {
          opacity: 0;
          width: 100%;
          transition: width 0.2s ease, opacity 0.4s ease 0.1s;
        }
        @media (prefers-reduced-motion: reduce) {
          .nav-progress__bar.is-loading {
            transition: opacity 0.2s ease;
            width: 90%;
          }
        }
      `}</style>
    </div>
  );
}

export default NavProgress;
