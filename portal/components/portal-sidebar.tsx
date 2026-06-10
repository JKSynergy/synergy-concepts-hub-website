"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { NavLink } from "@/components/nav-link";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard,
  FolderKanban,
  CalendarDays,
  Receipt,
  User,
  Users,
  Briefcase,
  MessageSquare,
  GraduationCap,
  BarChart3,
  CalendarRange,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
  LogOut,
  Settings,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type IconKey =
  | "dashboard"
  | "projects"
  | "bookings"
  | "calendar"
  | "invoices"
  | "profile"
  | "clients"
  | "services"
  | "leads"
  | "academy"
  | "reports"
  | "finances";

const ICONS: Record<IconKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  projects: FolderKanban,
  bookings: CalendarDays,
  calendar: CalendarRange,
  invoices: Receipt,
  profile: User,
  clients: Users,
  services: Briefcase,
  leads: MessageSquare,
  academy: GraduationCap,
  reports: BarChart3,
  finances: Wallet,
};

export interface NavItem {
  href: string;
  label: string;
  icon: IconKey;
  /** exact match only (used for dashboard root) */
  exact?: boolean;
}

interface PortalSidebarProps {
  brandName: string;
  brandSub: string;
  items: NavItem[];
  userLabel: string;
  userRole: string;
  userEmail?: string;
  logoSrc?: string;
}

export function PortalSidebar({
  brandName,
  brandSub,
  items,
  userLabel,
  userRole,
  userEmail,
  logoSrc = "/images/Website%20Logo%202.png",
}: PortalSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Restore collapse preference
  useEffect(() => {
    const saved = localStorage.getItem("sch-sidebar-collapsed");
    if (saved === "1") setCollapsed(true);
  }, []);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock body scroll + allow Escape to close while the mobile drawer is open
  useEffect(() => {
    if (!mobileOpen) return;

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen]);

  function toggleCollapse() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("sch-sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);

  const initials = userLabel.slice(0, 2).toUpperCase();

  return (
    <>
      {/* Mobile top bar */}
      <div className="portal-mobilebar">
        <button
          aria-label="Open menu"
          className="portal-mobilebar__btn"
          onClick={() => setMobileOpen(true)}
        >
          <Menu size={20} />
        </button>
        <span className="portal-mobilebar__title">{brandName}</span>
      </div>

      {/* Backdrop for mobile */}
      {mobileOpen && (
        <div
          className="portal-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`portal-sidebar ${collapsed ? "is-collapsed" : ""} ${
          mobileOpen ? "is-mobile-open" : ""
        }`}
      >
        {/* Brand */}
        <div className="portal-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} alt={brandName} />
          <div className="portal-brand__text">
            <span className="portal-brand__name">{brandName}</span>
            <span className="portal-brand__sub">{brandSub}</span>
          </div>
          <button
            aria-label="Close menu"
            className="portal-mobile-close"
            onClick={() => setMobileOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="portal-nav">
          <span className="portal-nav__label">Menu</span>
          {items.map((item) => {
            const Icon = ICONS[item.icon];
            return (
              <NavLink
                key={item.href}
                href={item.href}
                title={item.label}
                onClick={() => setMobileOpen(false)}
                className={`portal-nav-item ${isActive(item) ? "is-active" : ""}`}
              >
                <Icon strokeWidth={1.8} />
                <span className="portal-label">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* User card */}
        <div className="portal-user">
          <div className="portal-user__top">
            <div className="portal-user__avatar">{initials}</div>
            <div className="portal-user__meta">
              <div className="portal-user__name">{userLabel}</div>
              <div className="portal-user__role">{userRole}</div>
              {userEmail && (
                <div className="portal-user__email">{userEmail}</div>
              )}
            </div>
          </div>
          <div className="portal-user__actions">
            <button
              aria-label="Settings"
              className="portal-user__action-btn"
              title="Settings"
            >
              <Settings size={15} />
            </button>
            <button
              aria-label="Sign out"
              onClick={signOut}
              className="portal-user__action-btn portal-user__action-btn--danger"
              title="Sign out"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>

        {/* Collapse toggle */}
        <button
          className="portal-collapse-btn"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={toggleCollapse}
        >
          {collapsed ? (
            <PanelLeftOpen size={18} />
          ) : (
            <>
              <PanelLeftClose size={18} />
              <span className="portal-label">Collapse</span>
            </>
          )}
        </button>
      </aside>

      <style jsx global>{`
        .portal-mobilebar {
          display: none;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          width: 100%;
          height: 60px;
          z-index: 30;
          background: rgba(3, 7, 18, 0.8);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--p-border);
        }
        .portal-mobilebar__btn {
          display: grid;
          place-items: center;
          width: 38px;
          height: 38px;
          border-radius: 10px;
          color: var(--p-text);
          border: 1px solid var(--p-border);
        }
        .portal-mobilebar__title {
          font-family: "Sora", sans-serif;
          font-weight: 700;
          color: var(--p-text-strong);
        }
        .portal-mobile-close {
          display: none;
          margin-left: auto;
          color: var(--p-muted);
        }
        .portal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 35;
          background: rgba(3, 7, 18, 0.6);
          backdrop-filter: blur(2px);
        }
        @media (max-width: 768px) {
          .portal-mobilebar {
            display: flex;
          }
          .portal-mobile-close {
            display: block;
          }
          .portal-sidebar.is-collapsed {
            width: 264px;
          }
        }
      `}</style>
    </>
  );
}

export default PortalSidebar;
