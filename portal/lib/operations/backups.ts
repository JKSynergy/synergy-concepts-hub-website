/**
 * Backups workspace — pure derivation layer.
 *
 * All classifications are computed from `backup_policy_health` rows (the
 * authoritative deterministic view from migration 018) plus the policy and
 * system reference data the page already fetches. No schedule, retention, or
 * verification semantics are invented here.
 *
 * "unknown" is a workspace-level state: it means the health view could not
 * classify the policy (missing row or failed query). It is NEVER an alias
 * for healthy.
 */

// ─── Health states ───────────────────────────────────────────────────────────

export type BackupHealth =
  | "healthy"
  | "due"
  | "overdue"
  | "failed"
  | "unverified"
  | "inactive"
  | "unknown";

/** States emitted by the backup_policy_health view itself. */
const VIEW_HEALTH_STATES: readonly string[] = [
  "healthy",
  "due",
  "overdue",
  "failed",
  "unverified",
  "inactive",
];

/**
 * Resolve a policy's display health. A missing or unrecognized health row is
 * "unknown" — never silently "healthy".
 */
export function resolvePolicyHealth(viewHealth: string | null | undefined): BackupHealth {
  if (viewHealth && VIEW_HEALTH_STATES.includes(viewHealth)) return viewHealth as BackupHealth;
  return "unknown";
}

/** Urgency rank for list ordering — lower needs attention sooner. */
export const BACKUP_HEALTH_RANK: Record<BackupHealth, number> = {
  failed: 0,
  overdue: 1,
  unverified: 2,
  due: 3,
  unknown: 4,
  healthy: 5,
  inactive: 6,
};

// ─── Sorting & filtering ─────────────────────────────────────────────────────

export interface PolicyListRow {
  id: string;
  name: string;
  client_id: string;
  system_id: string | null;
  resource_id: string;
  health: BackupHealth;
  next_due_at: string | null;
  client?: { company_name?: string | null; email?: string | null } | null;
  system?: { name?: string | null } | null;
  resource?: { name?: string | null } | null;
}

/**
 * Operational ordering: most urgent health first; within a state, earliest
 * next-due wins so the backup that breaks first surfaces first. Rows without
 * a due date sort after dated rows within the same state.
 */
export function sortPoliciesForAttention<T extends PolicyListRow>(policies: T[]): T[] {
  return [...policies].sort((a, b) => {
    const ra = BACKUP_HEALTH_RANK[a.health] ?? 4;
    const rb = BACKUP_HEALTH_RANK[b.health] ?? 4;
    if (ra !== rb) return ra - rb;
    const da = a.next_due_at ? new Date(a.next_due_at).getTime() : null;
    const db = b.next_due_at ? new Date(b.next_due_at).getTime() : null;
    if (da !== null && db !== null && da !== db) return da - db;
    if ((da === null) !== (db === null)) return da === null ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

export interface PolicyFilters {
  health?: string;
  clientId?: string;
  systemId?: string;
  query?: string;
}

export function filterPolicies<T extends PolicyListRow>(policies: T[], f: PolicyFilters): T[] {
  const q = f.query?.trim().toLowerCase();
  return policies.filter((p) => {
    if (f.health && f.health !== "all" && p.health !== f.health) return false;
    if (f.clientId && f.clientId !== "all" && p.client_id !== f.clientId) return false;
    if (f.systemId && f.systemId !== "all" && p.system_id !== f.systemId) return false;
    if (q) {
      const hay = [p.name, p.client?.company_name, p.client?.email, p.system?.name, p.resource?.name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// ─── Coverage gap ────────────────────────────────────────────────────────────

export interface SystemRef {
  id: string;
  name: string;
  client_id: string;
}

export interface ResourceRef {
  id: string;
  system_id: string | null;
}

export interface PolicyCoverageRow {
  is_active: boolean;
  system_id: string | null;
  resource_id: string;
}

/**
 * Systems with NO active backup policy — the "not configured" state.
 * A system is covered when an active policy either targets it directly or
 * targets a resource that belongs to it.
 */
export function uncoveredSystems(
  systems: SystemRef[],
  policies: PolicyCoverageRow[],
  resources: ResourceRef[]
): SystemRef[] {
  const covered = new Set<string>();
  for (const p of policies) {
    if (!p.is_active) continue;
    if (p.system_id) covered.add(p.system_id);
    const res = resources.find((r) => r.id === p.resource_id);
    if (res?.system_id) covered.add(res.system_id);
  }
  return systems.filter((s) => !covered.has(s.id));
}

// ─── Summary counts ──────────────────────────────────────────────────────────

export interface BackupOpsSummary {
  failed: number;
  overdue: number;
  unverified: number;
  due: number;
  healthy: number;
  inactive: number;
  unknown: number;
  /** Policies in a state that warrants attention: failed + overdue + unverified. */
  needsAttention: number;
}

export function deriveBackupOpsSummary(policies: { health: BackupHealth }[]): BackupOpsSummary {
  const n = (h: BackupHealth) => policies.filter((p) => p.health === h).length;
  return {
    failed: n("failed"),
    overdue: n("overdue"),
    unverified: n("unverified"),
    due: n("due"),
    healthy: n("healthy"),
    inactive: n("inactive"),
    unknown: n("unknown"),
    needsAttention: n("failed") + n("overdue") + n("unverified"),
  };
}
