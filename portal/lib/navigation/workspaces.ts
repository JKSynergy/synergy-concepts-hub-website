// Admin navigation: four business workspaces plus shared services (Phase A).
//
// Navigation only. Hiding a link is NOT authorisation: every route keeps its own
// server-side role check, middleware applies adminRouteRedirect(), and the database
// applies RLS. Each item's `roles` mirrors those existing checks so nobody is shown
// a link they would be redirected away from; no role gains access through this file.
//
// Only routes that exist are linked. Where a business has no dedicated screens yet,
// the workspace shows a plain note (never a placeholder link). Records are not
// tagged by business in the database yet, so cross-business lists (enquiries,
// projects, clients, invoices) live in Concepts Hub or the shared area unfiltered.

import type { Role } from "../security/roles.ts";

export type NavItem = {
  href: string;
  label: string;
  /** Path prefixes that make this item current. */
  match: string[];
  /** Prefixes that must NOT make it current (a more specific item owns them). */
  exclude?: string[];
  exact?: boolean;
  roles: readonly Role[];
};

export type NavGroup = {
  id: string;
  label: string;
  kind: "workspace" | "shared";
  items: NavItem[];
  /** Shown instead of links when the workspace has no screens of its own yet. */
  note?: { text: string; roles: readonly Role[] };
};

const ALL_INTERNAL = ["admin", "staff", "finance"] as const;
const OPERATIONAL = ["admin", "staff"] as const;
const FINANCE = ["admin", "finance"] as const;
const ADMIN = ["admin"] as const;

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "concepts-hub",
    label: "Concepts Hub",
    kind: "workspace",
    items: [
      { href: "/admin", label: "Dashboard", match: ["/admin"], exact: true, roles: OPERATIONAL },
      { href: "/admin/leads", label: "Enquiries", match: ["/admin/leads", "/admin/bookings"], roles: OPERATIONAL },
      { href: "/admin/projects", label: "Projects", match: ["/admin/projects"], roles: ALL_INTERNAL },
      { href: "/admin/support", label: "Support", match: ["/admin/support"], roles: ALL_INTERNAL },
      { href: "/admin/systems", label: "Systems", match: ["/admin/systems"], roles: OPERATIONAL },
    ],
  },
  {
    id: "capture-films",
    label: "Capture Films",
    kind: "workspace",
    items: [
      {
        href: "/admin/services/capture-films",
        label: "Price list",
        match: ["/admin/services/capture-films"],
        roles: OPERATIONAL,
      },
    ],
  },
  {
    id: "creative-hub",
    label: "Creative Hub",
    kind: "workspace",
    items: [],
    note: {
      text: "No Creative Hub screens yet. Creative work is tracked in Concepts Hub, Projects.",
      roles: OPERATIONAL,
    },
  },
  {
    id: "academy",
    label: "Multimedia Academy",
    kind: "workspace",
    items: [{ href: "/admin/academy", label: "Courses", match: ["/admin/academy"], roles: ADMIN }],
  },
  {
    id: "customers",
    label: "Customers and contacts",
    kind: "shared",
    items: [{ href: "/admin/clients", label: "Clients", match: ["/admin/clients"], roles: ALL_INTERNAL }],
  },
  {
    id: "finance",
    label: "Finance",
    kind: "shared",
    items: [
      { href: "/admin/agreements", label: "Agreements", match: ["/admin/agreements"], roles: ALL_INTERNAL },
      {
        href: "/admin/invoices",
        label: "Invoices and payments",
        match: ["/admin/invoices", "/admin/finances", "/admin/reports"],
        roles: FINANCE,
      },
    ],
  },
  {
    id: "action-center",
    label: "Action Center",
    kind: "shared",
    items: [
      {
        href: "/admin/operations/action-center",
        label: "Action Center",
        match: ["/admin/operations/action-center"],
        roles: ALL_INTERNAL,
      },
    ],
  },
  {
    id: "administration",
    label: "Administration",
    kind: "shared",
    items: [
      {
        href: "/admin/operations",
        label: "Operations",
        match: ["/admin/operations"],
        exclude: ["/admin/operations/action-center"],
        roles: ALL_INTERNAL,
      },
      {
        href: "/admin/services",
        label: "Services",
        match: ["/admin/services"],
        exclude: ["/admin/services/capture-films"],
        roles: OPERATIONAL,
      },
      { href: "/admin/staff", label: "Team", match: ["/admin/staff"], roles: ADMIN },
    ],
  },
];

const under = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + "/");

export function isItemActive(item: NavItem, path: string): boolean {
  if (item.exact) return path === item.href;
  if (item.exclude?.some((p) => under(path, p))) return false;
  return item.match.some((m) => under(path, m));
}

export type VisibleGroup = Omit<NavGroup, "note"> & { note?: string };

/** The groups and items a role may see. Groups with nothing visible are dropped. */
export function navFor(role: Role | null): VisibleGroup[] {
  if (!role || role === "client") return [];
  const out: VisibleGroup[] = [];
  for (const g of NAV_GROUPS) {
    const items = g.items.filter((i) => i.roles.includes(role));
    const note = g.note && g.note.roles.includes(role) ? g.note.text : undefined;
    if (items.length === 0 && !note) continue;
    out.push({ id: g.id, label: g.label, kind: g.kind, items, ...(note ? { note } : {}) });
  }
  return out;
}

/** The workspace or shared area that owns a path, for the "you are here" label. */
export function activeGroupFor(path: string): NavGroup | null {
  for (const g of NAV_GROUPS) {
    if (g.items.some((i) => isItemActive(i, path))) return g;
  }
  return null;
}
