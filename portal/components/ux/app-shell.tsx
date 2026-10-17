"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { NavLink } from "@/components/nav-link";
import { createClient } from "@/lib/supabase/client";
import { FeedbackProvider } from "./feedback";
import { ThemeToggle } from "./theme-toggle";

export type ShellItem = { href: string; label: string; match: string[]; exact?: boolean };
export type ShellGroup = { label?: string; ariaLabel: string; items: ShellItem[] };
export type ShellTab = { href: string; label: string; match: string; exclude?: string; exact?: boolean };
export type ShellSection = { prefixes: string[]; tabs: ShellTab[] };

const FOCUSABLE = "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";

/** One application shell for every signed-in area (admin and client). */
export function AppShell({
  groups,
  sections = [],
  brandSub = "Concepts Hub",
  userLabel,
  userRole,
  children,
}: {
  groups: ShellGroup[];
  sections?: ShellSection[];
  brandSub?: string;
  userLabel: string;
  userRole: string;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const sideRef = useRef<HTMLElement>(null);

  const active = (i: ShellItem) =>
    i.exact ? pathname === i.href : i.match.some((m) => pathname === m || pathname.startsWith(m + "/"));

  // Close when the route changes.
  useEffect(() => setOpen(false), [pathname]);

  // On narrow screens the section tabs scroll sideways; keep the active one visible.
  useEffect(() => {
    const bar = document.querySelector<HTMLElement>(".ux-tabs");
    const tab = bar?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!bar || !tab || bar.scrollWidth <= bar.clientWidth) return;
    const t = tab.getBoundingClientRect();
    const r = bar.getBoundingClientRect();
    bar.scrollLeft += t.left - r.left - (r.width - t.width) / 2;
  }, [pathname]);

  // Open drawer: move focus in, trap Tab, close on Escape, return focus to Menu.
  useEffect(() => {
    if (!open) return;
    const side = sideRef.current;
    const items = () => Array.from(side?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((e) => e.getClientRects().length > 0);
    items()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const list = items();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      const current = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (current === first || !side?.contains(current))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (current === last || !side?.contains(current))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      menuRef.current?.focus();
    };
  }, [open]);

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const section = sections.find((s) => s.prefixes.some((p) => pathname === p || pathname.startsWith(p + "/")));
  const tabActive = (t: ShellTab) =>
    (t.exact ? pathname === t.match : pathname === t.match || pathname.startsWith(t.match + "/")) &&
    !(t.exclude && (pathname === t.exclude || pathname.startsWith(t.exclude + "/")));

  return (
    <div className="ux ux-frame">
      <FeedbackProvider>
        <a href="#ux-content" className="ux-skip">
          Skip to content
        </a>
        <div className="ux-topbar">
          <button ref={menuRef} type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="ux-side">
            Menu
          </button>
          <b>Synergy Concepts Hub</b>
        </div>
        {open && <div className="ux-scrim" onClick={() => setOpen(false)} aria-hidden="true" />}

        <aside id="ux-side" ref={sideRef} className={`ux-side ${open ? "is-open" : ""}`} aria-label="Primary">
          <div className="ux-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/Website%20Logo%202.png" alt="" />
            <div>
              <b>Synergy</b>
              <span>{brandSub}</span>
            </div>
          </div>
          {groups.map((g, gi) => (
            <div key={g.ariaLabel}>
              {g.label && (
                <div className="ux-nav-label" style={{ marginTop: gi === 0 ? 0 : 18 }}>
                  {g.label}
                </div>
              )}
              <nav className="ux-nav" aria-label={g.ariaLabel}>
                {g.items.map((i) => (
                  <NavLink key={i.href} href={i.href} aria-current={active(i) ? "page" : undefined}>
                    {i.label}
                  </NavLink>
                ))}
              </nav>
            </div>
          ))}
          <div className="ux-user">
            <b>{userLabel}</b>
            <span>{userRole}</span>
            <ThemeToggle />
            <button type="button" onClick={signOut}>
              Sign out
            </button>
          </div>
        </aside>

        <main className="ux-main" id="ux-content" tabIndex={-1}>
          {section && (
            <div className="ux-tabs" role="navigation" aria-label="Section">
              {section.tabs.map((t) => (
                <NavLink key={t.href} href={t.href} aria-current={tabActive(t) ? "page" : undefined}>
                  {t.label}
                </NavLink>
              ))}
            </div>
          )}
          {children}
        </main>
      </FeedbackProvider>
    </div>
  );
}
