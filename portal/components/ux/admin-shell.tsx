"use client";

import type { ReactNode } from "react";
import { AppShell, type ShellGroup, type ShellSection } from "./app-shell";
import { canAccessFinance, isAdmin as isAdminRole, isFinance, type Role } from "@/lib/security/roles";

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
      { href: "/admin/systems/operations", label: "Operations", match: "/admin/systems/operations" },
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
    ],
  },
];

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
  const isAdmin = isAdminRole(role);
  const finance = canAccessFinance(role);
  const financeOnly = isFinance(role); // finance sees Clients, Projects (read-only) and Finance only
  const financeGroup: ShellGroup = {
    label: "Money",
    ariaLabel: "Money",
    items: [{ href: "/admin/invoices", label: "Finance", match: ["/admin/invoices", "/admin/finances", "/admin/reports"] }],
  };
  const groups: ShellGroup[] = financeOnly
    ? [
        {
          ariaLabel: "Main",
          items: [
            { href: "/admin/clients", label: "Clients", match: ["/admin/clients"] },
            { href: "/admin/projects", label: "Projects", match: ["/admin/projects"] },
            { href: "/admin/agreements", label: "Agreements", match: ["/admin/agreements"] },
            { href: "/admin/operations", label: "Operations", match: ["/admin/operations"] },
          ],
        },
        financeGroup,
      ]
    : [
        {
          ariaLabel: "Main",
          items: [
            { href: "/admin", label: "Dashboard", match: ["/admin"], exact: true },
            { href: "/admin/clients", label: "Clients", match: ["/admin/clients"] },
          ],
        },
        {
          label: "Work",
          ariaLabel: "Work",
          items: [
            { href: "/admin/projects", label: "Projects", match: ["/admin/projects"] },
            { href: "/admin/leads", label: "Enquiries", match: ["/admin/bookings", "/admin/leads"] },
          ],
        },
        ...(finance ? [financeGroup] : []),
        {
          label: "Operations",
          ariaLabel: "Operations",
          items: [
            { href: "/admin/systems", label: "Systems", match: ["/admin/systems"] },
            { href: "/admin/agreements", label: "Agreements", match: ["/admin/agreements"] },
            { href: "/admin/operations", label: "Operations", match: ["/admin/operations"] },
          ],
        },
        {
          label: "Settings",
          ariaLabel: "Settings",
          items: [
            { href: "/admin/services", label: "Services", match: ["/admin/services"] },
            ...(isAdmin ? [{ href: "/admin/staff", label: "Team", match: ["/admin/staff"] }] : []),
          ],
        },
      ];
  return (
    <AppShell groups={groups} sections={SECTIONS} userLabel={userLabel} userRole={userRole}>
      {children}
    </AppShell>
  );
}
