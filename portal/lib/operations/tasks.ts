/**
 * Tasks workspace derivations — pure, deterministic.
 *
 * Statuses: open | assigned | in_progress | blocked | completed | cancelled
 * Terminal: completed, cancelled (DB lifecycle trigger enforces admin-only reopen).
 * Actionable = non-terminal.
 *
 * Ordering semantics mirror lib/operations/overview.ts `sortTasksForAttention`
 * (shared definition with the Operations Overview) but retain terminal tasks
 * for the workspace list rather than dropping them.
 */

export type TaskStatus =
  | "open"
  | "assigned"
  | "in_progress"
  | "blocked"
  | "completed"
  | "cancelled";

export type TaskPriority = "low" | "normal" | "high" | "urgent";

export const TERMINAL_TASK_STATUSES: readonly string[] = ["completed", "cancelled"];

/**
 * Permitted source statuses for each server action — mirrors the UI button
 * conditions in tasks-manager.tsx. The DB trigger independently protects
 * terminal states and role rules; these guards make stale/retried calls
 * no-ops at the UPDATE level (0 rows matched).
 */
export const TASK_TRANSITIONS: Record<"start" | "block" | "complete" | "cancel", readonly string[]> = {
  start: ["open", "assigned"],
  block: ["in_progress"],
  complete: ["in_progress", "assigned", "blocked"],
  cancel: ["open", "assigned", "in_progress", "blocked"],
};

export interface WorkspaceTask {
  id: string;
  status: string;
  priority?: string | null;
  due_at?: string | null;
  assigned_to?: string | null;
  title?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  updated_at?: string | null;
  client?: { company_name?: string | null; email?: string | null } | null;
  system?: { id?: string; name?: string | null } | null;
}

export function isActionableTask(t: { status: string }): boolean {
  return !TERMINAL_TASK_STATUSES.includes(t.status);
}

/** Overdue = actionable task whose due_at is in the past. Terminal tasks are never overdue. */
export function isTaskOverdue(t: WorkspaceTask, now: number): boolean {
  if (!isActionableTask(t) || !t.due_at) return false;
  const due = new Date(t.due_at).getTime();
  return Number.isFinite(due) && due < now;
}

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

function terminalTimestamp(t: WorkspaceTask): number {
  const ts = t.completed_at ?? t.cancelled_at ?? t.updated_at ?? t.created_at;
  return ts ? new Date(ts).getTime() : 0;
}

/**
 * Workspace ordering: actionable tasks first using the same attention order as
 * the Operations Overview (overdue → earliest due → no-due last → priority →
 * newest), then terminal tasks newest-completed first. Deterministic: id
 * tiebreaker on identical timestamps.
 */
export function sortTasksForWorkspace<T extends WorkspaceTask>(tasks: T[], now = Date.now()): T[] {
  const rank = (t: WorkspaceTask) => {
    if (!isActionableTask(t)) return 4;
    if (isTaskOverdue(t, now)) return 0;
    if (t.status === "in_progress" || t.status === "blocked") return 1;
    if (!t.assigned_to) return 3; // unassigned awaiting triage — after active work
    return 2;
  };
  return [...tasks].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 4) {
      const d = terminalTimestamp(b) - terminalTimestamp(a);
      if (d !== 0) return d;
      return (a.id ?? "").localeCompare(b.id ?? "");
    }
    const aDue = a.due_at ? new Date(a.due_at).getTime() : null;
    const bDue = b.due_at ? new Date(b.due_at).getTime() : null;
    if (aDue !== null && bDue !== null && aDue !== bDue) return aDue - bDue;
    if ((aDue === null) !== (bDue === null)) return aDue === null ? 1 : -1;
    const pa = PRIORITY_RANK[a.priority ?? "normal"] ?? 2;
    const pb = PRIORITY_RANK[b.priority ?? "normal"] ?? 2;
    if (pa !== pb) return pa - pb;
    const d = new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
    if (d !== 0) return d;
    return (a.id ?? "").localeCompare(b.id ?? "");
  });
}

export interface TaskFilters {
  status?: string;
  priority?: string;
  /** "all" | "mine" | "unassigned" | a profile id */
  assignee?: string;
  /** "all" | "overdue" */
  due?: string;
  /** "all" | a system id */
  systemId?: string;
  search?: string;
}

export function filterTasks<T extends WorkspaceTask>(
  tasks: T[],
  filters: TaskFilters,
  opts: { currentUserId?: string; now?: number } = {}
): T[] {
  const now = opts.now ?? Date.now();
  const q = filters.search?.trim().toLowerCase();
  return tasks.filter((t) => {
    if (filters.status && filters.status !== "all" && t.status !== filters.status) return false;
    if (filters.priority && filters.priority !== "all" && t.priority !== filters.priority) return false;
    if (filters.assignee && filters.assignee !== "all") {
      if (filters.assignee === "unassigned") {
        if (t.assigned_to) return false;
      } else if (filters.assignee === "mine") {
        if (t.assigned_to !== opts.currentUserId) return false;
      } else if (t.assigned_to !== filters.assignee) {
        return false;
      }
    }
    if (filters.due === "overdue" && !isTaskOverdue(t, now)) return false;
    if (filters.systemId && filters.systemId !== "all" && t.system?.id !== filters.systemId) return false;
    if (q) {
      const matchTitle = (t.title ?? "").toLowerCase().includes(q);
      const matchClient = (t.client?.company_name || t.client?.email || "").toLowerCase().includes(q);
      const matchSystem = (t.system?.name || "").toLowerCase().includes(q);
      if (!matchTitle && !matchClient && !matchSystem) return false;
    }
    return true;
  });
}

/**
 * Compact counts for the workspace summary line. Computed over the unfiltered
 * task list so the counts stay honest regardless of active filters.
 */
export function deriveTaskWorkspaceSummary<T extends WorkspaceTask>(
  tasks: T[],
  now = Date.now()
): { actionable: number; overdue: number; unassigned: number; blocked: number } {
  const actionable = tasks.filter(isActionableTask);
  return {
    actionable: actionable.length,
    overdue: actionable.filter((t) => isTaskOverdue(t, now)).length,
    unassigned: actionable.filter((t) => !t.assigned_to).length,
    blocked: actionable.filter((t) => t.status === "blocked").length,
  };
}
