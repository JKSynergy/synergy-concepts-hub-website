/**
 * Operations Overview — pure derivation layer.
 *
 * Every summary rendered on /admin/operations is computed here from rows the
 * page already has permission to read. The page converts each Supabase
 * response into a QueryOutcome FIRST: a failed query is carried through as
 * `ok: false` so it can never be silently rendered as a misleading zero
 * count or an "all clear" state.
 */

// ─── Query integrity ─────────────────────────────────────────────────────────

export type QueryOutcome<T> =
  | { ok: true; data: T }
  | { ok: false };

/** Convert a Supabase { data, error } response into a QueryOutcome. */
export function outcome<T>(res: { data: T | null; error: unknown }): QueryOutcome<T> {
  if (res.error) return { ok: false };
  return { ok: true, data: (res.data ?? []) as T };
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export interface TaskRow {
  id: string;
  title: string | null;
  status: string;
  priority: string | null;
  due_at: string | null;
  created_at: string;
  client?: unknown;
}

export interface TaskCounts {
  open: number;
  assigned: number;
  in_progress: number;
  blocked: number;
  due_soon: number;
  overdue: number;
  completed: number;
}

const OPEN_TASK_STATUSES = ["open", "assigned", "in_progress", "blocked"];
const DUE_SOON_MS = 48 * 60 * 60 * 1000;

export function deriveTaskCounts(tasks: TaskRow[], now = Date.now()): TaskCounts {
  const unfinished = tasks.filter((t) => !["completed", "cancelled"].includes(t.status));
  return {
    open: tasks.filter((t) => t.status === "open").length,
    assigned: tasks.filter((t) => t.status === "assigned").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    blocked: tasks.filter((t) => t.status === "blocked").length,
    due_soon: unfinished.filter(
      (t) => t.due_at && t.due_at > new Date(now).toISOString() && new Date(t.due_at).getTime() <= now + DUE_SOON_MS
    ).length,
    overdue: unfinished.filter((t) => t.due_at && new Date(t.due_at).getTime() < now).length,
    completed: tasks.filter((t) => t.status === "completed").length,
  };
}

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

/**
 * Unfinished tasks sorted for operational attention:
 * overdue first (oldest deadline first), then due-soon, then by priority,
 * then newest first. No due date sorts after dated items.
 */
export function sortTasksForAttention(tasks: TaskRow[], now = Date.now()): TaskRow[] {
  const unfinished = tasks.filter((t) => !["completed", "cancelled"].includes(t.status));
  return [...unfinished].sort((a, b) => {
    const aDue = a.due_at ? new Date(a.due_at).getTime() : null;
    const bDue = b.due_at ? new Date(b.due_at).getTime() : null;
    const aOverdue = aDue !== null && aDue < now;
    const bOverdue = bDue !== null && bDue < now;
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
    if (aDue !== null && bDue !== null && aDue !== bDue) return aDue - bDue;
    if ((aDue === null) !== (bDue === null)) return aDue === null ? 1 : -1;
    const pa = PRIORITY_RANK[a.priority ?? "normal"] ?? 2;
    const pb = PRIORITY_RANK[b.priority ?? "normal"] ?? 2;
    if (pa !== pb) return pa - pb;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

// ─── Incidents ───────────────────────────────────────────────────────────────

export interface IncidentRow {
  id: string;
  title: string | null;
  status: string;
  severity: string | null;
  opened_at: string | null;
  created_at: string;
  client?: unknown;
}

export interface IncidentCounts {
  open: number;
  active: number; // acknowledged + investigating + monitoring
  high_critical: number;
  resolved: number;
  closed: number;
}

const UNRESOLVED_INCIDENT_STATUSES = ["open", "acknowledged", "investigating", "monitoring"];
const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function deriveIncidentCounts(incidents: IncidentRow[]): IncidentCounts {
  return {
    open: incidents.filter((i) => i.status === "open").length,
    active: incidents.filter((i) => ["acknowledged", "investigating", "monitoring"].includes(i.status)).length,
    high_critical: incidents.filter(
      (i) => ["high", "critical"].includes(i.severity ?? "") && UNRESOLVED_INCIDENT_STATUSES.includes(i.status)
    ).length,
    resolved: incidents.filter((i) => i.status === "resolved").length,
    closed: incidents.filter((i) => i.status === "closed").length,
  };
}

/** Unresolved incidents sorted by severity, then oldest first. */
export function sortIncidentsForAttention(incidents: IncidentRow[]): IncidentRow[] {
  const unresolved = incidents.filter((i) => UNRESOLVED_INCIDENT_STATUSES.includes(i.status));
  return [...unresolved].sort((a, b) => {
    const sa = SEVERITY_RANK[a.severity ?? "low"] ?? 3;
    const sb = SEVERITY_RANK[b.severity ?? "low"] ?? 3;
    if (sa !== sb) return sa - sb;
    return new Date(a.opened_at ?? a.created_at).getTime() - new Date(b.opened_at ?? b.created_at).getTime();
  });
}

// ─── Suspension cases (client-level workflow) ────────────────────────────────

export interface SuspensionCaseRow {
  id: string;
  status: string;
}

export interface SuspensionCounts {
  pending_approval: number;
  approved: number;
  executing: number;
  suspended: number;
  restoration_pending: number;
}

export function deriveSuspensionCounts(cases: SuspensionCaseRow[]): SuspensionCounts {
  const n = (s: string) => cases.filter((c) => c.status === s).length;
  return {
    pending_approval: n("pending_approval"),
    approved: n("approved"),
    executing: n("executing"),
    suspended: n("suspended"),
    restoration_pending: n("restoration_pending"),
  };
}

// ─── Application-level suspended systems ─────────────────────────────────────

export interface SystemStatusRow {
  id: string;
  name: string | null;
  status: string | null;
  suspended_at: string | null;
}

/** Systems whose managed-application status is currently "suspended". */
export function suspendedSystems(systems: SystemStatusRow[]): SystemStatusRow[] {
  return systems
    .filter((s) => s.status === "suspended")
    .sort((a, b) => new Date(b.suspended_at ?? 0).getTime() - new Date(a.suspended_at ?? 0).getTime());
}

// ─── Backups ─────────────────────────────────────────────────────────────────

export interface BackupHealthRow {
  policy_id: string;
  policy_name?: string | null;
  health: string;
  last_completed_at: string | null;
  last_verified_at: string | null;
  next_due_at: string | null;
  last_failure_reason: string | null;
  last_event_at: string | null;
}

export interface BackupSummary {
  healthy: number;
  due: number;
  overdue: number;
  failed: number;
  unverified: number;
  total: number;
  /** Most recent verified backup evidence across all policies (or null). */
  lastVerifiedAt: string | null;
  /** Earliest upcoming due timestamp (or null). */
  nextDueAt: string | null;
  /** Policies whose last event failed — evidence for attention. */
  failedReasons: (string | null)[];
}

export function deriveBackupSummary(rows: BackupHealthRow[]): BackupSummary {
  const n = (h: string) => rows.filter((r) => r.health === h).length;
  const verified = rows.map((r) => r.last_verified_at).filter(Boolean) as string[];
  const due = rows.map((r) => r.next_due_at).filter(Boolean) as string[];
  return {
    healthy: n("healthy"),
    due: n("due"),
    overdue: n("overdue"),
    failed: n("failed"),
    unverified: n("unverified"),
    total: rows.length,
    lastVerifiedAt: verified.length ? verified.sort().at(-1)! : null,
    nextDueAt: due.length ? due.sort()[0] : null,
    failedReasons: rows.filter((r) => r.health === "failed").map((r) => r.last_failure_reason),
  };
}

// ─── Action Center signals (action_item_overview) ────────────────────────────

export interface ActionSignalRow {
  id: string;
  severity: string;
  status: string;
  title: string | null;
  detected_at: string;
  client_company: string | null;
  system_name: string | null;
  resource_name: string | null;
}

export interface SignalSummary {
  critical: number;
  warning: number;
  info: number;
  totalOpen: number;
  top: ActionSignalRow[];
}

const OPEN_SIGNAL_STATUSES = ["open", "acknowledged"];

export function deriveSignalSummary(items: ActionSignalRow[]): SignalSummary {
  const open = items.filter((i) => OPEN_SIGNAL_STATUSES.includes(i.status));
  const sevRank: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  const sorted = [...open].sort(
    (a, b) =>
      (sevRank[a.severity] ?? 3) - (sevRank[b.severity] ?? 3) ||
      new Date(a.detected_at).getTime() - new Date(b.detected_at).getTime()
  );
  return {
    critical: open.filter((i) => i.severity === "critical").length,
    warning: open.filter((i) => i.severity === "warning").length,
    info: open.filter((i) => i.severity === "info").length,
    totalOpen: open.length,
    top: sorted.slice(0, 5),
  };
}

// ─── Provider operations (admin/finance only) ────────────────────────────────

export interface ProviderProposalRow {
  id: string;
  status: string;
  operation_key: string | null;
  provider_name: string | null;
  external_name: string | null;
  system_name: string | null;
  created_at: string;
}

export interface ProviderActionSummary {
  proposed: number;
  approved: number;
  verificationPending: number;
  total: number;
  top: ProviderProposalRow[];
}

const PENDING_PROPOSAL_STATUSES = ["proposed", "approved", "verification_pending"];

export function deriveProviderActionSummary(rows: ProviderProposalRow[]): ProviderActionSummary {
  const pending = rows.filter((r) => PENDING_PROPOSAL_STATUSES.includes(r.status));
  const sorted = [...pending].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  return {
    proposed: pending.filter((r) => r.status === "proposed").length,
    approved: pending.filter((r) => r.status === "approved").length,
    verificationPending: pending.filter((r) => r.status === "verification_pending").length,
    total: pending.length,
    top: sorted.slice(0, 5),
  };
}

// ─── Provider monitoring (admin/finance only) ────────────────────────────────

export interface MonitoringScheduleRow {
  schedule_id: string;
  provider_name: string | null;
  account_name: string | null;
  enabled: boolean;
  consecutive_failures: number | null;
  last_run_status: string | null;
  next_run_at: string | null;
  last_run_at: string | null;
}

export interface MonitoringSummary {
  enabled: number;
  disabled: number;
  failing: number;
  lastFailedRunAt: string | null;
  nextRunAt: string | null;
}

export function deriveMonitoringSummary(rows: MonitoringScheduleRow[]): MonitoringSummary {
  const enabled = rows.filter((r) => r.enabled);
  const failing = enabled.filter((r) => (r.consecutive_failures ?? 0) > 0);
  const lastFailed = enabled
    .filter((r) => r.last_run_status === "failed" && r.last_run_at)
    .map((r) => r.last_run_at!)
    .sort();
  const nextRuns = enabled.map((r) => r.next_run_at).filter(Boolean) as string[];
  return {
    enabled: enabled.length,
    disabled: rows.length - enabled.length,
    failing: failing.length,
    lastFailedRunAt: lastFailed.length ? lastFailed.at(-1)! : null,
    nextRunAt: nextRuns.length ? nextRuns.sort()[0] : null,
  };
}

// ─── Renewals (staff-safe view — renewal state only) ─────────────────────────

export interface RenewalRow {
  id: string;
  renewal_state: string | null;
}

export interface RenewalCounts {
  upcoming: number;
  due: number;
  overdue: number;
}

export function deriveRenewalCounts(rows: RenewalRow[]): RenewalCounts {
  return {
    upcoming: rows.filter((r) => r.renewal_state === "upcoming").length,
    due: rows.filter((r) => r.renewal_state === "due").length,
    overdue: rows.filter((r) => r.renewal_state === "overdue").length,
  };
}

// ─── Recent activity (audit_logs — admin only) ───────────────────────────────

export interface AuditRow {
  action: string;
  table_name: string | null;
  record_id: string | null;
  created_at: string;
  actor?: { full_name?: string | null } | { full_name?: string | null }[] | null;
}

export interface ActivityItem {
  id: string;
  label: string;
  detail: string | null;
  at: string;
  href: string;
}

const ACTIVITY_DESTINATIONS: Record<string, string> = {
  incidents: "/admin/operations/incidents",
  tasks: "/admin/operations/tasks",
  suspension_cases: "/admin/operations/suspensions",
  backup_events: "/admin/operations/backups",
  provider_operation_proposals: "/admin/operations/provider-actions",
  provider_operation_executions: "/admin/operations/provider-actions",
  provider_monitoring_runs: "/admin/systems/monitoring",
  provider_monitoring_schedules: "/admin/systems/monitoring",
  systems: "/admin/systems",
};

const ACTIVITY_ACTION_LABELS: Record<string, string> = {
  "incident.resolved": "Incident resolved",
  "incident.closed": "Incident closed",
  "incident.cancelled": "Incident cancelled",
  "task.completed": "Task completed",
  "task.cancelled": "Task cancelled",
  "suspension_case.approved": "Suspension approved",
  "suspension_case.rejected": "Suspension rejected",
  "suspension_case.execution_started": "Suspension execution started",
  "suspension_case.executed": "Suspension executed",
  "suspension_case.restoration_started": "Restoration started",
  "suspension_case.restored": "Suspension restored",
  "suspension_case.cancelled": "Suspension cancelled",
  "backup_event.verified": "Backup verified",
  "backup_event.failed": "Backup failed",
  "provider_operation.proposed": "Provider action proposed",
  "provider_operation.approved": "Provider action approved",
  "provider_operation.rejected": "Provider action rejected",
  "provider_operation.cancelled": "Provider action cancelled",
  "provider_operation.execution_started": "Provider action execution started",
  "provider_operation.completed": "Provider action completed",
  "provider_operation.failed": "Provider action failed",
  "provider_operation.stale": "Provider action stale",
  "system_status_token.rotated": "Status token rotated",
};

/** Tables that carry operational meaning on the Overview activity list. */
export const ACTIVITY_TABLES = Object.keys(ACTIVITY_DESTINATIONS);

/** Map an audit row to a display item; unknown actions fall back to a clean label. */
export function describeAuditEvent(row: AuditRow): ActivityItem {
  const actor = Array.isArray(row.actor) ? row.actor[0] : row.actor;
  const label = ACTIVITY_ACTION_LABELS[row.action] ?? row.action.replace(/[._]/g, " ");
  return {
    id: `${row.table_name ?? "record"}:${row.record_id ?? row.created_at}:${row.action}`,
    label,
    detail: actor?.full_name ? `by ${actor.full_name}` : null,
    at: row.created_at,
    href: ACTIVITY_DESTINATIONS[row.table_name ?? ""] ?? "/admin/operations",
  };
}
