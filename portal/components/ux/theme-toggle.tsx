"use client";

import { useEffect, useState } from "react";

/**
 * Light / dark switch for the portal.
 * "Auto" follows the device setting and is the default. A Light or Dark choice
 * is remembered in this browser. The first paint is handled by THEME_SCRIPT in
 * app/layout.tsx, so there is no flash; this component only changes it later.
 */
type Choice = "system" | "light" | "dark";

export const THEME_KEY = "sch-theme";

const OPTIONS: { value: Choice; label: string }[] = [
  { value: "system", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function apply(choice: Choice) {
  const dark =
    choice === "dark" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  root.dataset.theme = dark ? "dark" : "light";
  root.style.colorScheme = dark ? "dark" : "light";
}

export function ThemeToggle() {
  const [choice, setChoice] = useState<Choice>("system");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "light" || saved === "dark") setChoice(saved);
    } catch {
      /* storage blocked: stay on Auto */
    }
  }, []);

  // On Auto, follow the device if it switches while the portal is open.
  useEffect(() => {
    if (choice !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [choice]);

  function pick(next: Choice) {
    setChoice(next);
    try {
      if (next === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, next);
    } catch {
      /* storage blocked: applies for this visit only */
    }
    apply(next);
  }

  return (
    <div className="ux-theme" role="radiogroup" aria-label="Theme">
      {OPTIONS.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={choice === o.value} onClick={() => pick(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
