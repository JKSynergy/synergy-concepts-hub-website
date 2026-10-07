// Single source of truth for role checks in application code.
// The database (RLS, migrations 010-012) remains the authoritative control; these
// helpers keep the UI, middleware, server actions and API routes consistent with it.
//
//   admin    everything
//   finance  invoices, payments, receipts, reports (read + operate); read-only Clients and Projects
//   staff    operational work; NO finance data; read-only Services
//   client   own data only

export const ROLES = ["admin", "finance", "staff", "client"] as const;
export type Role = (typeof ROLES)[number];
/** Roles that may be assigned to team members (never "admin" or "client" via the team form). */
export const ASSIGNABLE_TEAM_ROLES = ["staff", "finance"] as const;
export type TeamRole = (typeof ASSIGNABLE_TEAM_ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
export function isTeamRole(value: unknown): value is TeamRole {
  return typeof value === "string" && (ASSIGNABLE_TEAM_ROLES as readonly string[]).includes(value);
}

type R = string | null | undefined;

export const isAdmin = (r: R) => r === "admin";
export const isFinance = (r: R) => r === "finance";
/** Exactly the staff role (not admin, who shares operational rights). */
export const isStaff = (r: R) => r === "staff";
export const isClient = (r: R) => r === "client";
/** Operational staff rights (leads, bookings, project work, internal notes). Finance is NOT included. */
export const isOperationalStaff = (r: R) => r === "admin" || r === "staff";
/** May read and operate invoices, payments, receipts and reports. */
export const canAccessFinance = (r: R) => r === "admin" || r === "finance";
/** Anyone who signs in to the /admin area. */
export const isInternal = (r: R) => r === "admin" || r === "staff" || r === "finance";
/** May read the Clients and Projects screens (finance read-only). */
export const canViewClientsAndProjects = isInternal;
/** Only admin creates/edits clients, projects, services, team, academy and roles. */
export const canManageTeam = isAdmin;
export const canManageServices = isAdmin;

/** Where a signed-in user lands. */
export function landingFor(role: R): string {
  if (role === "finance") return "/admin/invoices";
  return isOperationalStaff(role) ? "/admin" : "/client";
}

export const FINANCE_ALLOWED_PREFIXES = ["/admin/invoices", "/admin/finances", "/admin/reports", "/admin/clients", "/admin/projects", "/admin/agreements", "/admin/operations", "/admin/systems/providers", "/admin/systems/reconciliation", "/admin/systems/monitoring", "/admin/systems/events", "/admin/systems/automation", "/admin/operations/provider-actions"] as const;
/** Path prefixes ordinary staff may never use. */
export const STAFF_BLOCKED_PREFIXES = ["/admin/invoices", "/admin/finances", "/admin/reports", "/admin/academy", "/admin/staff"] as const;
/** Path prefixes only an admin may use. */
export const ADMIN_ONLY_PREFIXES = ["/admin/academy", "/admin/staff"] as const;

const under = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + "/");

/**
 * Route decision for /admin/* paths. Returns a redirect target or null to allow.
 * (Pages, actions and the database still enforce their own checks.)
 */
export function adminRouteRedirect(role: R, path: string): string | null {
  if (!isInternal(role)) return "/client";
  if (role === "admin") return null;
  if (role === "finance") {
    if (path === "/admin") return "/admin/invoices";
    return FINANCE_ALLOWED_PREFIXES.some((p) => under(path, p)) ? null : "/admin/invoices";
  }
  // staff
  return STAFF_BLOCKED_PREFIXES.some((p) => under(path, p)) ? "/admin" : null;
}
