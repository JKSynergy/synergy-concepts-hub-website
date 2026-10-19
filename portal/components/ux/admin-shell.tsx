"use client";

import type { ReactNode } from "react";
import { AppShell, type ShellGroup, type ShellItem, type ShellSection } from "./app-shell";
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
  // Grouped by how work flows: enquiry -> client -> project, then what they pay for,
  // then what is hosted and run for them. No group label repeats an item label.
  const item = {
    dashboard: { href: "/admin", label: "Dashboard", match: ["/admin"], exact: true },
    enquiries: { href: "/admin/leads", label: "Enquiries", match: ["/admin/bookings", "/admin/leads"] },
    clients: { href: "/admin/clients", label: "Clients", match: ["/admin/clients"] },
    projects: { href: "/admin/projects", label: "Projects", match: ["/admin/projects"] },
    agreements: { href: "/admin/agreements", label: "Agreements", match: ["/admin/agreements"] },
    finance: { href: "/admin/invoices", label: "Finance", match: ["/admin/invoices", "/admin/finances", "/admin/reports"] },
    systems: { href: "/admin/systems", label: "Systems", match: ["/admin/systems"] },
    operations: { href: "/admin/operations", label: "Operations", match: ["/admin/operations"] },
    services: { href: "/admin/services", label: "Services", match: ["/admin/services"] },
    team: { href: "/admin/staff", label: "Team", match: ["/admin/staff"] },
  } satisfies Record<string, ShellItem>;

  const groups: ShellGroup[] = financeOnly
    ? [
        // finance sees Clients, Projects (read-only), Agreements, Finance and Operations
        { label: "Work", ariaLabel: "Work", items: [item.clients, item.projects] },
        { label: "Money", ariaLabel: "Money", items: [item.agreements, item.finance] },
        { label: "Platform", ariaLabel: "Platform", items: [item.operations] },
      ]
    : [
        { ariaLabel: "Main", items: [item.dashboard] },
        { label: "Work", ariaLabel: "Work", items: [item.enquiries, item.clients, item.projects] },
        { label: "Money", ariaLabel: "Money", items: finance ? [item.agreements, item.finance] : [item.agreements] },
        { label: "Platform", ariaLabel: "Platform", items: [item.systems, item.operations] },
        { label: "Settings", ariaLabel: "Settings", items: isAdmin ? [item.services, item.team] : [item.services] },
      ];
  return (
    <AppShell groups={groups} sections={SECTIONS} userLabel={userLabel} userRole={userRole}>
      {children}
    </AppShell>
  );
}
