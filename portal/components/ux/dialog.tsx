"use client";

import { useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Modal behaviour shared by every dialog: focus moves in on open, Tab stays
 * inside, Escape closes, and focus returns to whatever opened it.
 */
export function Dialog({
  onClose,
  labelledBy,
  alert,
  maxWidth,
  dismissible = true,
  children,
}: {
  onClose: () => void;
  labelledBy: string;
  alert?: boolean;
  maxWidth?: number;
  dismissible?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const root = ref.current;
    const opener = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(root?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((e) => e.getClientRects().length > 0);

    if (root && !root.contains(document.activeElement)) {
      // Prefer the first field; for confirmations, the first (safe) button.
      const first = root.querySelector<HTMLElement>("input:not([type=hidden]),select,textarea") ?? focusables()[0] ?? root;
      first.focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !root) return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === firstEl || !root.contains(active))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && (active === lastEl || !root.contains(active))) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);

  return (
    <div
      className="ux-overlay"
      onMouseDown={(e) => {
        if (dismissible && e.target === e.currentTarget) closeRef.current();
      }}
    >
      <div
        ref={ref}
        className="ux-dialog"
        role={alert ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        style={maxWidth ? { maxWidth } : undefined}
      >
        {children}
      </div>
    </div>
  );
}
