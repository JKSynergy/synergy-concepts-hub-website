/**
 * Suspensions workspace — pure derivation & transition rules.
 *
 * Two distinct layers, never conflated:
 *   1. suspension_cases — the governed client-level workflow.
 *   2. systems.status   — application-level access state ('live'/'suspended').
 *
 * A case does not prove the application is suspended; a suspended system does
 * not require a case. Discrepancies are surfaced, never silently reconciled.
 */

// ─── Case lifecycle transitions ──────────────────────────────────────────────

/**
 * Allowed from-statuses for each workflow action. Mirrors the UI buttons and
 * the check_suspension_case_lifecycle trigger. Repeated transitions match
 * zero rows at the server — no write, no duplicate audit event.
 */
export const CASE_TRANSITIONS: Record<string, readonly string[]> = {
  approve: ["proposed", "pending_approval"],
  reject: ["proposed", "pending_approval"],
  execute_start: ["approved"],
  execute: ["approved", "executing"],
  initiate_restoration: ["suspended"],
  complete_restoration: ["suspended", "restoration_pending"],
  cancel: ["proposed", "pending_approval", "approved", "executing", "suspended", "restoration_pending"],
};

export function caseTransitionAllowed(action: keyof typeof CASE_TRANSITIONS, fromStatus: string): boolean {
  return (CASE_TRANSITIONS[action] ?? []).includes(fromStatus);
}

/** suspension_actions may be completed from these states; verified/completed retries no-op. */
export const ACTION_COMPLETABLE_STATUSES = ["pending", "in_progress", "failed"] as const;

// ─── Ordering & filtering ────────────────────────────────────────────────────

/**
 * Urgency rank: work awaiting a decision or mid-flight first, then the
 * steady suspended state, then terminal cases.
 */
const CASE_RANK: Record<string, number> = {
  pending_approval: 0,
  proposed: 0,
  executing: 1,
  restoration_pending: 2,
  suspended: 3,
};

export interface CaseListRow {
  id: string;
  status: string;
  requested_at: string | null;
  created_at: string;
}

export function sortCasesForAttention<T extends CaseListRow>(cases: T[]): T[] {
  return [...cases].sort((a, b) => {
    const ra = CASE_RANK[a.status] ?? 4;
    const rb = CASE_RANK[b.status] ?? 4;
    if (ra !== rb) return ra - rb;
    // Aging work first within a rank; terminal cases newest first.
    const ta = new Date(a.requested_at ?? a.created_at).getTime();
    const tb = new Date(b.requested_at ?? b.created_at).getTime();
    return ra < 4 ? ta - tb : tb - ta;
  });
}

export interface CaseFilterRow extends CaseListRow {
  reason: string;
  client?: { company_name?: string | null; email?: string | null } | null;
  service_agreement?: { name?: string | null } | null;
}

export function filterCases<T extends CaseFilterRow>(
  cases: T[],
  f: { status?: string; query?: string }
): T[] {
  const q = f.query?.trim().toLowerCase();
  return cases.filter((c) => {
    if (f.status && f.status !== "all" && c.status !== f.status) return false;
    if (q) {
      const hay = [c.reason, c.client?.company_name, c.client?.email, c.service_agreement?.name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// ─── Case / system-state discrepancies ───────────────────────────────────────

/**
 * Compare a case's workflow status against its linked system's real
 * application-level status. Returns a discrepancy code or null.
 *
 * These are observations, not errors: a system can be suspended at the
 * application layer without a case, and a case can be closed while the
 * operator deliberately left the app suspended.
 */
export function caseSystemDiscrepancy(
  caseStatus: string,
  systemStatus: string | null | undefined
): "case_active_system_live" | "case_closed_system_suspended" | null {
  if (!systemStatus) return null;
  if (
    ["executing", "suspended", "restoration_pending"].includes(caseStatus) &&
    systemStatus !== "suspended"
  ) {
    return "case_active_system_live";
  }
  if (["restored", "rejected", "cancelled"].includes(caseStatus) && systemStatus === "suspended") {
    return "case_closed_system_suspended";
  }
  return null;
}

// ─── Application-level suspension (shared with Operations Overview) ──────────

export interface SystemStatusRow {
  id: string;
  status: string | null;
}

export function isSuspendedSystem(s: { status: string | null }): boolean {
  return s.status === "suspended";
}
