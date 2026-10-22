"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppShell, type ShellGroup, type ShellSection } from "./app-shell";
import type { Role } from "@/lib/security/roles";
import { activeGroupFor, navFor } from "@/lib/navigation/workspaces";

// Section tabs for areas with several related screens. Unchanged by the workspace
// shell: they still appear above the page wherever the path matches.
const SECTIONS: ShellSection[] = [
  {
    prefixes: ["/admin/bookings", "/admin/leads"],
    tabs: [
      { href: "/admin/leads", label: "Website enquiries", match: "/admin/leads" },
      { href: "/admin/bookings", label: "Booking requests", match: "/admin/bookings", exclude: "/admin/bookings/calendar" },
      { href: "/admin/bookings/calendar", label: "Calendar", match: "/admin/bookings/calendar" },
    ],
  },
  {
    prefixes: ["/admin/invoices", "/admin/finances", "/admin/reports"],
    tabs: [
      { href: "/admin/invoices", label: "Invoices", match: "/admin/invoices" },
      { href: "/admin/finances", label: "Payments", match: "/admin/finances", exact: true },
      { href: "/admin/reports", label: "Reports", match: "/admin/reports" },
      { href: "/admin/finances/packages", label: "Packages", match: "/admin/finances/packages" },
      { href: "/admin/finances/provider-costs", label: "Provider Costs", match: "/admin/finances/provider-costs" },
    ],
  },
  {
    prefixes: ["/admin/systems"],
    tabs: [
      { href: "/admin/systems", label: "Systems", match: "/admin/systems", exact: true },
      { href: "/admin/systems/providers", label: "Providers", match: "/admin/systems/providers" },
      { href: "/admin/systems/reconciliation", label: "Reconciliation", match: "/admin/systems/reconciliation" },
      { href: "/admin/systems/monitoring", label: "Monitoring", match: "/admin/systems/monitoring" },
      { href: "/admin/systems/events", label: "Events", match: "/admin/systems/events" },
      { href: "/admin/systems/automation", label: "Automation", match: "/admin/systems/automation" },
    ],
  },
  {
    prefixes: ["/admin/operations"],
    tabs: [
      { href: "/admin/operations", label: "Overview", match: "/admin/operations", exact: true },
      { href: "/admin/operations/action-center", label: "Action Center", match: "/admin/operations/action-center" },
      { href: "/admin/operations/tasks", label: "Tasks", match: "/admin/operations/tasks" },
      { href: "/admin/operations/incidents", label: "Incidents", match: "/admin/operations/incidents" },
      { href: "/admin/operations/backups", label: "Backups", match: "/admin/operations/backups" },
      { href: "/admin/operations/suspensions", label: "Suspensions", match: "/admin/operations/suspensions" },
      { href: "/admin/operations/provider-actions", label: "Provider Actions", match: "/admin/operations/provider-actions" },
    ],
  },
];

/**
 * Admin navigation: business workspaces, then shared services (lib/navigation/workspaces.ts).
 * Links are filtered by role for clarity only; pages, middleware and RLS enforce access.
 */
export function AdminShell({
  role,
  userLabel,
  userRole,
  children,
}: {
  role: Role | null;
  userLabel: string;
  userRole: string;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const visible = navFor(role);
  const firstShared = visible.findIndex((g) => g.kind === "shared");
  const groups: ShellGroup[] = visible.map((g, i) => ({
    // A group whose only link has the same name shows the link alone (no repeated label).
    label: g.items.length === 1 && g.items[0].label === g.label && !g.note ? undefined : g.label,
    ariaLabel: g.label,
    items: g.items,
    note: g.note,
    sectionBefore: i === 0 && g.kind === "workspace" ? "Businesses" : i === firstShared ? "Shared services" : undefined,
  }));

  const here = activeGroupFor(pathname);
  const context = here ? (here.kind === "workspace" ? here.label : `Shared: ${here.label}`) : "Concepts Hub";

  return (
    <AppShell groups={groups} sections={SECTIONS} brandSub={context} context={context} userLabel={userLabel} userRole={userRole}>
      {children}
    </AppShell>
  );
}
