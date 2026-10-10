// Tasks workspace — ordering, filtering, transition-rule, and summary tests.
// Proves overdue/critical work can't be buried under newer low-priority or
// terminal rows, filters compose correctly, invalid/retried transitions are
// rejected before any write reaches the database, and workspace semantics
// stay consistent with the Operations Overview (actionable = not completed
// or cancelled; overdue = actionable with a past due_at).

import test from "node:test";
import assert from "node:assert/strict";
import {
  sortTasksForWorkspace,
  filterTasks,
  isTaskOverdue,
  isActionableTask,
  deriveTaskWorkspaceSummary,
  TASK_TRANSITIONS,
  TERMINAL_TASK_STATUSES,
  type WorkspaceTask,
} from "../lib/operations/tasks.ts";
import { deriveTaskCounts } from "../lib/operations/overview.ts";

const NOW = new Date("2026-10-20T12:00:00.000Z").getTime();
const H = 60 * 60 * 1000;
const D = 24 * H;
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

function row(partial: Partial<WorkspaceTask> & { id: string }): WorkspaceTask {
  return {
    status: "open",
    priority: "normal",
    due_at: null,
    assigned_to: null,
    title: "task",
    created_at: iso(0),
    client: { company_name: "Acme" },
    system: null,
    ...partial,
  };
}

// ─── Ordering ────────────────────────────────────────────────────────────────

test("actionable tasks sort before terminal regardless of recency", () => {
  const sorted = sortTasksForWorkspace([
    row({ id: "completedNew", status: "completed", created_at: iso(-1 * H), completed_at: iso(-1 * H) }),
    row({ id: "openOld", status: "open", created_at: iso(-100 * H), assigned_to: "u1" }),
  ], NOW);
  assert.deepEqual(sorted.map((t) => t.id), ["openOld", "completedNew"]);
});

test("overdue tasks lead the list, oldest deadline first", () => {
  const sorted = sortTasksForWorkspace([
    row({ id: "recentCreated", status: "open", priority: "low", created_at: iso(-1 * H), assigned_to: "u1" }),
    row({ id: "overdueOld", status: "assigned", due_at: iso(-3 * D), created_at: iso(-10 * D), assigned_to: "u1" }),
    row({ id: "overdueNew", status: "open", priority: "low", due_at: iso(-1 * H), created_at: iso(-1 * H), assigned_to: "u1" }),
    row({ id: "dueSoon", status: "assigned", priority: "urgent", due_at: iso(1 * D), created_at: iso(-2 * D), assigned_to: "u1" }),
  ], NOW);
  assert.deepEqual(sorted.map((t) => t.id), ["overdueOld", "overdueNew", "dueSoon", "recentCreated"]);
});

test("within non-overdue actionable: earlier due first, then priority, then newest", () => {
  const sorted = sortTasksForWorkspace([
    row({ id: "noDue", status: "assigned", priority: "urgent", assigned_to: "u1", created_at: iso(-1 * H) }),
    row({ id: "dueLater", status: "assigned", priority: "urgent", due_at: iso(5 * D), assigned_to: "u1", created_at: iso(-2 * D) }),
    row({ id: "dueSooner", status: "assigned", priority: "low", due_at: iso(1 * D), assigned_to: "u1", created_at: iso(-3 * D) }),
  ], NOW);
  assert.deepEqual(sorted.map((t) => t.id), ["dueSooner", "dueLater", "noDue"]);
});

test("unassigned actionable tasks sort after assigned actionable, before terminal", () => {
  const sorted = sortTasksForWorkspace([
    row({ id: "completed", status: "completed", completed_at: iso(-1 * H), created_at: iso(-2 * D) }),
    row({ id: "unassigned", status: "open", created_at: iso(-1 * D) }),
    row({ id: "assigned", status: "assigned", assigned_to: "u1", created_at: iso(-3 * D) }),
  ], NOW);
  assert.deepEqual(sorted.map((t) => t.id), ["assigned", "unassigned", "completed"]);
});

test("ordering is deterministic — id tiebreaker on identical timestamps", () => {
  const a = row({ id: "a", status: "assigned", assigned_to: "u1", created_at: iso(-1 * H) });
  const b = row({ id: "b", status: "assigned", assigned_to: "u1", created_at: iso(-1 * H) });
  assert.deepEqual(sortTasksForWorkspace([b, a], NOW).map((t) => t.id), ["a", "b"]);
});

test("terminal group orders newest completion first", () => {
  const sorted = sortTasksForWorkspace([
    row({ id: "completedOld", status: "completed", completed_at: iso(-5 * D), created_at: iso(-6 * D) }),
    row({ id: "cancelledNew", status: "cancelled", cancelled_at: iso(-1 * H), created_at: iso(-2 * D) }),
  ], NOW);
  assert.deepEqual(sorted.map((t) => t.id), ["cancelledNew", "completedOld"]);
});

// ─── Overdue predicate ───────────────────────────────────────────────────────

test("terminal tasks are never overdue, and missing due_at is not overdue", () => {
  assert.equal(isTaskOverdue(row({ id: "t", status: "completed", due_at: iso(-1 * D) }), NOW), false);
  assert.equal(isTaskOverdue(row({ id: "t", status: "cancelled", due_at: iso(-1 * D) }), NOW), false);
  assert.equal(isTaskOverdue(row({ id: "t", status: "open", due_at: null }), NOW), false);
  assert.equal(isTaskOverdue(row({ id: "t", status: "open", due_at: iso(-1 * D) }), NOW), true);
  assert.equal(isTaskOverdue(row({ id: "t", status: "open", due_at: iso(1 * D) }), NOW), false);
});

// ─── Filtering ───────────────────────────────────────────────────────────────

test("filters compose: status + priority + assignee + overdue + system + search", () => {
  const tasks = [
    row({ id: "match", status: "in_progress", priority: "high", assigned_to: "u1", due_at: iso(-1 * D), system: { id: "s1", name: "LMS" }, title: "fix db" }),
    row({ id: "wrongStatus", status: "open", priority: "high", assigned_to: "u1", due_at: iso(-1 * D), system: { id: "s1" } }),
    row({ id: "wrongPrio", status: "in_progress", priority: "low", assigned_to: "u1", due_at: iso(-1 * D), system: { id: "s1" } }),
    row({ id: "wrongAssignee", status: "in_progress", priority: "high", assigned_to: "u2", due_at: iso(-1 * D), system: { id: "s1" } }),
    row({ id: "notOverdue", status: "in_progress", priority: "high", assigned_to: "u1", due_at: iso(1 * D), system: { id: "s1" } }),
    row({ id: "wrongSystem", status: "in_progress", priority: "high", assigned_to: "u1", due_at: iso(-1 * D), system: { id: "s2" } }),
    row({ id: "wrongText", status: "in_progress", priority: "high", assigned_to: "u1", due_at: iso(-1 * D), system: { id: "s1" }, title: "unrelated" }),
  ];
  const out = filterTasks(tasks, {
    status: "in_progress", priority: "high", assignee: "u1",
    due: "overdue", systemId: "s1", search: "fix",
  }, { now: NOW });
  assert.deepEqual(out.map((t) => t.id), ["match"]);
});

test("assignee filter: 'mine' and 'unassigned' modes", () => {
  const tasks = [
    row({ id: "mine", assigned_to: "u1" }),
    row({ id: "other", assigned_to: "u2" }),
    row({ id: "free", assigned_to: null }),
  ];
  assert.deepEqual(filterTasks(tasks, { assignee: "mine" }, { currentUserId: "u1" }).map((t) => t.id), ["mine"]);
  assert.deepEqual(filterTasks(tasks, { assignee: "unassigned" }).map((t) => t.id), ["free"]);
});

test("search matches title, client, and system name", () => {
  const tasks = [
    row({ id: "byTitle", title: "Rotate provider keys" }),
    row({ id: "byClient", client: { company_name: "Elgon Bottling" } }),
    row({ id: "bySystem", system: { id: "s1", name: "QuickCredit" } }),
  ];
  assert.deepEqual(filterTasks(tasks, { search: "rotate" }).map((t) => t.id), ["byTitle"]);
  assert.deepEqual(filterTasks(tasks, { search: "elgon" }).map((t) => t.id), ["byClient"]);
  assert.deepEqual(filterTasks(tasks, { search: "quickcredit" }).map((t) => t.id), ["bySystem"]);
});

// ─── Transition rules ────────────────────────────────────────────────────────

test("start only from open/assigned — cannot restart completed, cancelled, or blocked", () => {
  for (const ok of TASK_TRANSITIONS.start) {
    assert.ok(["open", "assigned"].includes(ok));
  }
  assert.deepEqual(TASK_TRANSITIONS.start, ["open", "assigned"]);
});

test("block only from in_progress; complete mirrors UI (in_progress/assigned/blocked); cancel excludes terminal", () => {
  assert.deepEqual(TASK_TRANSITIONS.block, ["in_progress"]);
  assert.deepEqual(TASK_TRANSITIONS.complete, ["in_progress", "assigned", "blocked"]);
  assert.deepEqual(TASK_TRANSITIONS.cancel, ["open", "assigned", "in_progress", "blocked"]);
});

test("retried transitions are no-ops: completed task matches no allowed source", () => {
  // .in('status', allowed) means a retried complete/cancel on a now-terminal
  // task affects 0 rows — no duplicate audit event, no appended status note.
  for (const action of Object.values(TASK_TRANSITIONS)) {
    assert.equal(action.includes("completed"), false);
    assert.equal(action.includes("cancelled"), false);
  }
});

test("'open' is not a valid source for complete — a task must be assigned or in flight", () => {
  assert.equal(TASK_TRANSITIONS.complete.includes("open"), false);
});

// ─── Summary ────────────────────────────────────────────────────────────────

test("workspace summary counts actionable, overdue, unassigned, blocked over unfiltered data", () => {
  const tasks = [
    row({ id: "overdue", status: "assigned", assigned_to: "u1", due_at: iso(-1 * D) }),
    row({ id: "unassigned", status: "open" }),
    row({ id: "blocked", status: "blocked", assigned_to: "u1" }),
    row({ id: "done", status: "completed", due_at: iso(-5 * D) }), // terminal — never overdue/actionable
  ];
  assert.deepEqual(deriveTaskWorkspaceSummary(tasks, NOW), {
    actionable: 3, overdue: 1, unassigned: 1, blocked: 1,
  });
});

// ─── Overview consistency ────────────────────────────────────────────────────

test("workspace 'actionable' matches the Overview's 'unfinished' definition", () => {
  const tasks = [
    row({ id: "o", status: "open" }), row({ id: "a", status: "assigned" }),
    row({ id: "p", status: "in_progress" }), row({ id: "b", status: "blocked" }),
    row({ id: "d", status: "completed" }), row({ id: "x", status: "cancelled" }),
  ];
  const workspaceActionable = tasks.filter(isActionableTask).length;
  const overviewCounts = deriveTaskCounts(tasks.map((t) => ({
    id: t.id, title: t.title ?? null, status: t.status, priority: t.priority ?? null,
    due_at: t.due_at ?? null, created_at: t.created_at ?? iso(0),
  })), NOW);
  const overviewUnfinished =
    overviewCounts.open + overviewCounts.assigned + overviewCounts.in_progress + overviewCounts.blocked;
  assert.equal(workspaceActionable, overviewUnfinished);
  assert.equal(overviewCounts.overdue, tasks.filter((t) => isTaskOverdue(t, NOW)).length);
});

test("terminal statuses are exactly completed/cancelled — matches DB lifecycle trigger", () => {
  assert.deepEqual(TERMINAL_TASK_STATUSES, ["completed", "cancelled"]);
});
