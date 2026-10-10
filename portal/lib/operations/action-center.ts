/**
 * Action Center + Provider Actions derivations — pure, deterministic.
 *
 * action_items statuses: open | acknowledged | resolved | dismissed
 * action_items severities: critical | warning | info
 * Actionable (matches Operations Overview feed predicate): open + acknowledged.
 * Dedup: one open/acknowledged row per dedupe_key (partial unique index) —
 * repeats refresh the existing item; occurrence_count tracks repeats.
 *
 * provider_operation_proposals statuses:
 *   proposed | approved | rejected | cancelled | executing |
 *   verification_pending | verified | failed | verification_failed | stale
 * The DB RPCs enforce every transition; ordering here is display-only.
 */

export const ACTIONABLE_SIGNAL_STATUSES: readonly string[] = ["open", "acknowledged"];

/** Same definition the Operations Overview feed uses: open + acknowledged. */
export function isActionableSignal(s: { status: string }): boolean {
  return ACTIONABLE_SIGNAL_STATUSES.includes(s.status);
}

const SEVERITY_RANK: Record<string, number> = { critical: 0, warning: 1, info: 2 };

export interface ActionItemRow {
  id: string;
  status: string;
  severity: string;
  detected_at?: string | null;
  resolved_at?: string | null;
}

/**
 * Open/acknowledged signals first: critical → warning → info, oldest detected
 * first within each severity. Terminal (resolved/dismissed) after, newest
 * resolution first. Id tiebreaker keeps ordering deterministic.
 */
export function sortActionItems<T extends ActionItemRow>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aOpen = isActionableSignal(a);
    const bOpen = isActionableSignal(b);
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    if (aOpen) {
      const sa = SEVERITY_RANK[a.severity] ?? 2;
      const sb = SEVERITY_RANK[b.severity] ?? 2;
      if (sa !== sb) return sa - sb;
      const d = new Date(a.detected_at ?? 0).getTime() - new Date(b.detected_at ?? 0).getTime();
      if (d !== 0) return d;
    } else {
      const d =
        new Date(b.resolved_at ?? b.detected_at ?? 0).getTime() -
        new Date(a.resolved_at ?? a.detected_at ?? 0).getTime();
      if (d !== 0) return d;
    }
    return a.id.localeCompare(b.id);
  });
}

export function filterActionItems<T extends { status: string; severity: string; source?: string }>(
  items: T[],
  filters: { severity?: string; source?: string }
): T[] {
  return items.filter((i) => {
    if (filters.severity && filters.severity !== "all" && i.severity !== filters.severity) return false;
    if (filters.source && filters.source !== "all" && i.source !== filters.source) return false;
    return true;
  });
}

/**
 * Permitted source statuses per review decision — mirrors review_action_item
 * (terminal items are no-ops; acknowledge additionally must not rewrite an
 * existing acknowledgement's actor/timestamp).
 */
export const ACTION_ITEM_DECISIONS: Record<"acknowledge" | "resolve" | "dismiss", readonly string[]> = {
  acknowledge: ["open"],
  resolve: ["open", "acknowledged"],
  dismiss: ["open", "acknowledged"],
};

export function actionItemDecisionAllowed(
  decision: keyof typeof ACTION_ITEM_DECISIONS,
  currentStatus: string
): boolean {
  return ACTION_ITEM_DECISIONS[decision].includes(currentStatus);
}

// ─── Provider operation proposals ───────────────────────────────────────────

export interface OperationProposalRow {
  id: string;
  status: string;
  created_at?: string | null;
}

/**
 * Decision-workflow ordering: items waiting on a human first —
 * verification_pending (needs verify) → proposed (needs decision) →
 * approved (needs execute) → executing/verification_failed/failed →
 * terminal. Within a group, oldest first. Display-only: transitions are
 * enforced by the provider-operation RPCs.
 */
const PROPOSAL_GROUP: Record<string, number> = {
  verification_pending: 0,
  proposed: 1,
  approved: 2,
  executing: 3,
  verification_failed: 4,
  failed: 4,
};

export function sortProposalsForAttention<T extends OperationProposalRow>(proposals: T[]): T[] {
  return [...proposals].sort((a, b) => {
    const ga = PROPOSAL_GROUP[a.status] ?? 5;
    const gb = PROPOSAL_GROUP[b.status] ?? 5;
    if (ga !== gb) return ga - gb;
    if (ga === 5) {
      const d = new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
      if (d !== 0) return d;
    } else {
      const d = new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime();
      if (d !== 0) return d;
    }
    return a.id.localeCompare(b.id);
  });
}
