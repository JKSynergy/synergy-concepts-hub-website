"use client";

/**
 * Operations master-detail pages stack the list above the detail panel on
 * narrow screens. After a row is tapped there, bring the detail into view so
 * the selection visibly does something. No-op on wider layouts.
 */
export function revealOpsDetail() {
  if (typeof window === "undefined") return;
  if (!window.matchMedia("(max-width: 900px)").matches) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Wait a frame so the newly selected record has rendered.
  window.requestAnimationFrame(() => {
    document.querySelector<HTMLElement>(".ops-detail")?.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "start",
    });
  });
}
