/**
 * Incidents workspace — pure derivation & transition rules.
 *
 * Sorting, filtering, and lifecycle validation live here so both the page
 * component and the server actions share one definition of "unresolved",
 * "urgent", and "allowed transition". A suspended system is a commercial
 * state, never infrastructure evidence.
 */

// ─── Lifecycle ───────────────────────────────────────────────────────────────

export const UNRESOLVED_INCIDENT_STATUSES = [
  "open",
  "acknowledged",
  "investigating",
  "monitoring",
] as const;

export const TERMINAL_INCIDENT_STATUSES = ["resolved", "closed", "cancelled"] as const;

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const TERMINAL_RANK: Record<string, number> = { resolved: 0, closed: 1, cancelled: 2 };

export interface IncidentWorkRow {
  id: string;
  status: string;
  severity: string | null;
  opened_at: string | null;
  created_at: string;
}

export function isUnresolvedIncident(i: { status: string }): boolean {
  return (UNRESOLVED_INCIDENT_STATUSES as readonly string[]).includes(i.status);
}

/**
 * Workspace ordering: unresolved incidents first — highest severity, then
 * oldest open — because age on an unresolved critical is what hurts. Terminal
 * incidents follow, resolved before closed before cancelled, newest first.
 */
export function sortIncidentsForWork<T extends IncidentWorkRow>(incidents: T[]): T[] {
  return [...incidents].sort((a, b) => {
    const aOpen = isUnresolvedIncident(a);
    const bOpen = isUnresolvedIncident(b);
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    if (aOpen) {
      const sa = SEVERITY_RANK[a.severity ?? "low"] ?? 3;
      const sb = SEVERITY_RANK[b.severity ?? "low"] ?? 3;
      if (sa !== sb) return sa - sb;
      // Oldest unresolved first — age is the risk.
      return new Date(a.opened_at ?? a.created_at).getTime() - new Date(b.opened_at ?? b.created_at).getTime();
    }
    const ta = TERMINAL_RANK[a.status] ?? 3;
    const tb = TERMINAL_RANK[b.status] ?? 3;
    if (ta !== tb) return ta - tb;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

// ─── Filtering ───────────────────────────────────────────────────────────────

export interface IncidentFilterRow extends IncidentWorkRow {
  title: string;
  system_id: string | null;
  system?: { name?: string | null } | null;
  client?: { company_name?: string | null; email?: string | null } | null;
}

export interface IncidentFilters {
  status?: string;
  severity?: string;
  systemId?: string;
  query?: string;
}

export function filterIncidents<T extends IncidentFilterRow>(incidents: T[], f: IncidentFilters): T[] {
  const q = f.query?.trim().toLowerCase();
  return incidents.filter((i) => {
    if (f.status && f.status !== "all" && i.status !== f.status) return false;
    if (f.severity && f.severity !== "all" && i.severity !== f.severity) return false;
    if (f.systemId && f.systemId !== "all" && i.system_id !== f.systemId) return false;
    if (q) {
      const hay = [i.title, i.client?.company_name, i.client?.email, i.system?.name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// ─── Transition validation ───────────────────────────────────────────────────

/**
 * Allowed from-statuses for each lifecycle action. Mirrors the transition
 * buttons the workspace renders, enforced server-side in lib/actions so a
 * retried or out-of-band request can never regress a terminal incident or
 * produce duplicate audit events. The DB lifecycle trigger additionally
 * protects closed/cancelled rows and admin-only transitions.
 */
export const INCIDENT_TRANSITIONS: Record<string, readonly string[]> = {
  acknowledge: ["open"],
  investigate: ["acknowledged", "monitoring"],
  monitor: ["investigating"],
  resolve: ["acknowledged", "investigating", "monitoring"],
  close: ["resolved"],
  cancel: ["open", "acknowledged", "investigating", "monitoring", "resolved"],
};

export function incidentTransitionAllowed(action: keyof typeof INCIDENT_TRANSITIONS, fromStatus: string): boolean {
  return (INCIDENT_TRANSITIONS[action] ?? []).includes(fromStatus);
}
