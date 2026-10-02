// Small, dependency-free authorization helpers shared by API routes and actions.
// The database (RLS) remains the primary control; these give explicit, testable
// checks in front of any code that uses the service-role key or signs URLs.

import { canAccessFinance, isRole, type Role } from "./roles.ts";

export type PortalRole = Role;

export function isPortalRole(value: unknown): value is PortalRole {
  return isRole(value);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * May this user download the PDF for this invoice?
 * admin/finance: yes. Ordinary staff: no (finance data is restricted in migration 012).
 * client: only their own invoice, and never a draft.
 */
export function canViewInvoiceDocument(input: {
  role: PortalRole | null;
  userId: string;
  invoice: { client_id: string; status: string } | null;
}): boolean {
  const { role, userId, invoice } = input;
  if (!role || !invoice) return false;
  if (canAccessFinance(role)) return true;
  if (role !== "client") return false;
  return invoice.client_id === userId && invoice.status !== "draft";
}

/**
 * The storage path for a deliverable is derived from the database record, never
 * from the browser. It must live under the deliverable's own project folder.
 */
export function deliverableStoragePath(input: {
  project_id: string;
  file_url: string | null;
}): string | null {
  const { project_id, file_url } = input;
  if (!file_url || !isUuid(project_id)) return null;
  if (file_url.includes("..") || file_url.startsWith("/") || file_url.includes("\\")) return null;
  if (!file_url.startsWith(`${project_id}/`)) return null;
  return file_url;
}

/** Keep uploaded file names to a safe character set for storage keys. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "");
  return (cleaned || "file").slice(0, 120);
}
