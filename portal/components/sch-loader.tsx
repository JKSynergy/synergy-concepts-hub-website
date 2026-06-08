"use client";

import { useEffect, useState } from "react";

/* ─────────────────────────────────────────────────────────────
   SCH Loader
   Three orbiting segments = Systems · Media · Academy
   SVG-based · GPU-only transforms (60fps) · brand-colored glow
   ───────────────────────────────────────────────────────────── */

type LoaderStatus = "loading" | "success";

export interface SCHLoaderProps {
  /** Pixel size of the loader (width = height). Default 96. */
  size?: number;
  /** Controlled state. Omit to let the loader auto-complete via `autoCompleteMs`. */
  status?: LoaderStatus;
  /**
   * If `status` is not provided, the loader auto-transitions to the success
   * checkmark after this many ms. Set to 0 to disable (spin forever).
   * Default 1600ms (within the 1.2–2s spec).
   */
  autoCompleteMs?: number;
  /** Fired once the success checkmark has appeared. */
  onComplete?: () => void;
  /** Optional caption shown beneath the loader. */
  label?: string;
  /** Center logo URL. Falls back to an "SC" monogram on error. */
  logoSrc?: string;
  className?: string;
}

const BLUE = "#0ea5e9"; // Systems
const ORANGE = "#f59e0b"; // Media
const BLUE_DARK = "#38bdf8"; // Academy (lighter blue for layered depth)

export function SCHLoader({
  size = 96,
  status,
  autoCompleteMs = 1600,
  onComplete,
  label,
  logoSrc = "https://synergyconceptshub.com/images/Website%20Logo%202.png",
  className = "",
}: SCHLoaderProps) {
  const isControlled = status !== undefined;
  const [internal, setInternal] = useState<LoaderStatus>("loading");
  const current = isControlled ? status! : internal;

  // Auto-complete (uncontrolled mode)
  useEffect(() => {
    if (isControlled || autoCompleteMs <= 0) return;
    const t = setTimeout(() => setInternal("success"), autoCompleteMs);
    return () => clearTimeout(t);
  }, [isControlled, autoCompleteMs]);

  // Fire onComplete when success is reached
  useEffect(() => {
    if (current === "success") {
      const t = setTimeout(() => onComplete?.(), 450);
      return () => clearTimeout(t);
    }
  }, [current, onComplete]);

  const isDone = current === "success";

  return (
    <div
      className={`sch-loader ${className}`}
      style={{ width: size }}
      role="status"
      aria-live="polite"
      aria-label={isDone ? "Complete" : "Loading"}
    >
      <div
        className="sch-loader__stage"
        style={{ width: size, height: size }}
      >
        <svg
          className={`sch-loader__svg ${isDone ? "is-done" : ""}`}
          width={size}
          height={size}
          viewBox="0 0 100 100"
          fill="none"
          aria-hidden="true"
        >
          <defs>
            {/* Gradient trails: transparent -> brand color */}
            <linearGradient id="schSystems" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={BLUE} stopOpacity="0" />
              <stop offset="100%" stopColor={BLUE} stopOpacity="1" />
            </linearGradient>
            <linearGradient id="schMedia" x1="1" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ORANGE} stopOpacity="0" />
              <stop offset="100%" stopColor={ORANGE} stopOpacity="1" />
            </linearGradient>
            <linearGradient id="schAcademy" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor={BLUE_DARK} stopOpacity="0" />
              <stop offset="100%" stopColor={BLUE_DARK} stopOpacity="1" />
            </linearGradient>
          </defs>

          {/* Faint track */}
          <circle
            cx="50"
            cy="50"
            r="40"
            stroke="rgba(148,163,184,0.10)"
            strokeWidth="1"
          />

          {/* Orbiting segments — each rotates around the shared center.
              dasharray creates the partial arc; gradient creates the trail. */}
          <g className="sch-loader__rings">
            {/* Systems — outer, clockwise */}
            <circle
              className="sch-ring sch-ring--systems"
              cx="50"
              cy="50"
              r="40"
              stroke="url(#schSystems)"
              strokeWidth="4"
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray="62 38"
            />
            {/* Media — middle, counter-clockwise */}
            <circle
              className="sch-ring sch-ring--media"
              cx="50"
              cy="50"
              r="30"
              stroke="url(#schMedia)"
              strokeWidth="3.5"
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray="52 48"
            />
            {/* Academy — inner, clockwise (faster) */}
            <circle
              className="sch-ring sch-ring--academy"
              cx="50"
              cy="50"
              r="21"
              stroke="url(#schAcademy)"
              strokeWidth="3"
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray="46 54"
            />
          </g>

          {/* Success checkmark */}
          <g className={`sch-loader__check ${isDone ? "is-visible" : ""}`}>
            <circle
              className="sch-check__ring"
              cx="50"
              cy="50"
              r="40"
              stroke={BLUE}
              strokeWidth="4"
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray="100 100"
            />
            <path
              className="sch-check__mark"
              d="M34 51 L45 62 L67 39"
              stroke={BLUE}
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={100}
              strokeDasharray="100 100"
            />
          </g>
        </svg>

        {/* Center logo (fades out on success) */}
        <div className={`sch-loader__logo ${isDone ? "is-hidden" : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoSrc}
            alt="SCH"
            onError={(e) => {
              const t = e.currentTarget;
              t.style.display = "none";
              const fb = t.nextElementSibling as HTMLElement | null;
              if (fb) fb.style.display = "flex";
            }}
          />
          <span className="sch-loader__monogram">SC</span>
        </div>
      </div>

      {label && (
        <p className={`sch-loader__label ${isDone ? "is-done" : ""}`}>{label}</p>
      )}

      {/* Scoped styles — keeps the component self-contained & portable */}
      <style jsx>{`
        .sch-loader {
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          gap: 0.85rem;
        }

        .sch-loader__stage {
          position: relative;
          display: grid;
          place-items: center;
        }

        .sch-loader__svg {
          display: block;
          filter: drop-shadow(0 0 8px rgba(14, 165, 233, 0.55)) drop-shadow(0 0 20px rgba(14, 165, 233, 0.25));
          transition: opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }

        /* Hide the spinning rings once the checkmark takes over */
        .sch-loader__rings {
          transform-origin: 50% 50%;
          transition: opacity 0.35s ease;
        }
        .sch-loader__svg.is-done .sch-loader__rings {
          opacity: 0;
        }

        .sch-ring {
          transform-origin: 50% 50%;
          will-change: transform;
        }
        .sch-ring--systems {
          animation: sch-spin 1.6s linear infinite;
        }
        .sch-ring--media {
          animation: sch-spin-rev 1.3s linear infinite;
        }
        .sch-ring--academy {
          animation: sch-spin 1s linear infinite;
        }

        /* ── Center logo ── */
        .sch-loader__logo {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          animation: sch-fade-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
          transition: opacity 0.3s ease, transform 0.3s ease;
        }
        .sch-loader__logo.is-hidden {
          opacity: 0;
          transform: scale(0.85);
        }
        .sch-loader__logo :global(img) {
          width: 42%;
          height: 42%;
          object-fit: contain;
          border-radius: 8px;
        }
        .sch-loader__monogram {
          display: none;
          width: 42%;
          height: 42%;
          align-items: center;
          justify-content: center;
          border-radius: 9px;
          font-family: "Sora", system-ui, sans-serif;
          font-weight: 800;
          font-size: 1rem;
          color: #fff;
          background: linear-gradient(135deg, ${BLUE}, ${ORANGE});
        }

        /* ── Success checkmark ── */
        .sch-loader__check {
          opacity: 0;
          transform-origin: 50% 50%;
          transform: scale(0.6);
          transition: opacity 0.25s ease, transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .sch-loader__check.is-visible {
          opacity: 1;
          transform: scale(1);
        }
        .sch-loader__check.is-visible .sch-check__ring {
          animation: sch-draw 0.5s cubic-bezier(0.65, 0, 0.35, 1) forwards;
        }
        .sch-loader__check.is-visible .sch-check__mark {
          animation: sch-draw 0.4s cubic-bezier(0.65, 0, 0.35, 1) 0.25s forwards;
        }

        /* ── Caption ── */
        .sch-loader__label {
          margin: 0;
          font-size: 0.8rem;
          letter-spacing: 0.04em;
          color: #94a3b8;
          transition: color 0.3s ease;
          font-family: "Space Grotesk", system-ui, sans-serif;
          text-shadow: 0 0 12px rgba(14, 165, 233, 0.2);
        }
        .sch-loader__label.is-done {
          color: ${BLUE};
        }

        @keyframes sch-spin {
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes sch-spin-rev {
          to {
            transform: rotate(-360deg);
          }
        }
        @keyframes sch-fade-in {
          from {
            opacity: 0;
            transform: scale(0.7);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes sch-draw {
          to {
            stroke-dashoffset: 0;
            stroke-dasharray: 100 0;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .sch-ring {
            animation-duration: 3s;
          }
          .sch-loader__check,
          .sch-loader__logo {
            transition: none;
          }
        }
      `}</style>
    </div>
  );
}

/* Full-screen overlay variant — drop-in page/route loader */
export function SCHLoaderOverlay({
  label = "Loading your workspace",
  ...props
}: SCHLoaderProps) {
  return (
    <div className="sch-loader-overlay">
      <SCHLoader size={112} label={label} {...props} />
      <style jsx>{`
        .sch-loader-overlay {
          position: fixed;
          inset: 0;
          z-index: 60;
          display: grid;
          place-items: center;
          background:
            radial-gradient(ellipse 60% 50% at 50% 40%, rgba(14, 165, 233, 0.08) 0%, transparent 60%),
            #0b0f19;
          animation: sch-overlay-in 0.3s ease both;
        }
        @keyframes sch-overlay-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

export default SCHLoader;
