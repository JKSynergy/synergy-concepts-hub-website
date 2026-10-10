// Operations Overview — derivation & integrity tests.
// Proves the QueryOutcome boundary can never turn a failed query into a
// misleading "all clear", and validates sorting, grouping and role-safe
// derivation from existing data sources.

import test from "node:test";
import assert from "node:assert/strict";
import {
  outcome,
  deriveTaskCounts,
  sortTasksForAttention,
  deriveIncidentCounts,
  sortIncidentsForAttention,
  deriveSuspensionCounts,
  suspendedSystems,
  deriveBackupSummary,
  deriveSignalSummary,
  deriveProviderActionSummary,
  deriveMonitoringSummary,
  deriveRenewalCounts,
  describeAuditEvent,
  ACTIVITY_TABLES,
} from "../lib/operations/overview.ts";

const NOW = new Date("2026-10-20T12:00:00.000Z").getTime();
const H = 60 * 60 * 1000;
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

// ─── Query integrity ─────────────────────────────────────────────────────────

test("successful empty result produces ok outcome with empty data", () => {
  const r = outcome<{ id: string }[]>({ data: [], error: null });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.data, []);
});

test("null data with no error is a successful empty result", () => {
  const r = outcome<{ id: string }[]>({ data: null, error: null });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.data, []);
});

test("query error produces failed outcome, never data", () => {
  const r = outcome<{ id: string }[]>({ data: null, error: { message: "connection lost" } });
  assert.equal(r.ok, false);
});

test("failed backup query cannot derive a healthy/zero-failure summary", () => {
  const r = outcome({ data: null, error: { message: "view missing" } });
  assert.equal(r.ok, false);
  // The page must not call deriveBackupSummary on failed data — and cannot:
  // r.data does not exist on a failed outcome (compile-time guard too).
  assert.equal("data" in r, false);
});

test("section failures are independent — one failure does not corrupt others", () => {
  const tasks = outcome({ data: [{ id: "t1", title: "T", status: "open", priority: "normal", due_at: null, created_at: iso(0) }], error: null });
  const failed = outcome({ data: null, error: { message: "down" } });
  assert.equal(tasks.ok, true);
  assert.equal(failed.ok, false);
  if (tasks.ok) {
    const c = deriveTaskCounts(tasks.data, NOW);
    assert.equal(c.open, 1);
  }
});

// ─── Suspended systems ───────────────────────────────────────────────────────

test("suspended system without a suspension case still appears", () => {
  const systems = [
    { id: "s1", name: "Solvers Bookings", status: "suspended", suspended_at: iso(-H) },
    { id: "s2", name: "Merit Media", status: "live", suspended_at: null },
  ];
  const cases: { id: string; status: string }[] = []; // no suspension_case at all
  const suspended = suspendedSystems(systems);
  assert.equal(suspended.length, 1);
  assert.equal(suspended[0].name, "Solvers Bookings");
  assert.equal(deriveSuspensionCounts(cases).suspended, 0); // case layer unaffected
});

test("live systems do not appear as suspended; suspended list sorts newest first", () => {
  const systems = [
    { id: "s1", name: "A", status: "live", suspended_at: null },
    { id: "s2", name: "B", status: "suspended", suspended_at: iso(-5 * H) },
    { id: "s3", name: "C", status: "suspended", suspended_at: iso(-H) },
    { id: "s4", name: "D", status: "maintenance", suspended_at: null },
  ];
  const s = suspendedSystems(systems);
  assert.deepEqual(s.map((x) => x.id), ["s3", "s2"]);
});

// ─── Action Center signals ───────────────────────────────────────────────────

test("open and acknowledged signals counted by severity; resolved dismissed", () => {
  const items = [
    { id: "1", severity: "critical", status: "open", title: "t", detected_at: iso(-H), client_company: null, system_name: "S", resource_name: null },
    { id: "2", severity: "warning", status: "acknowledged", title: "t", detected_at: iso(-2 * H), client_company: null, system_name: null, resource_name: null },
    { id: "3", severity: "info", status: "resolved", title: "t", detected_at: iso(-H), client_company: null, system_name: null, resource_name: null },
    { id: "4", severity: "critical", status: "dismissed", title: "t", detected_at: iso(-H), client_company: null, system_name: null, resource_name: null },
  ];
  const s = deriveSignalSummary(items);
  assert.equal(s.critical, 1);
  assert.equal(s.warning, 1);
  assert.equal(s.info, 0);
  assert.equal(s.totalOpen, 2);
});

test("critical signals surface first in the top list, oldest first within severity", () => {
  const items = [
    { id: "info1", severity: "info", status: "open", title: "t", detected_at: iso(-10 * H), client_company: null, system_name: null, resource_name: null },
    { id: "crit-new", severity: "critical", status: "open", title: "t", detected_at: iso(-1 * H), client_company: null, system_name: null, resource_name: null },
    { id: "crit-old", severity: "critical", status: "open", title: "t", detected_at: iso(-3 * H), client_company: null, system_name: null, resource_name: null },
  ];
  const s = deriveSignalSummary(items);
  assert.deepEqual(s.top.map((i) => i.id), ["crit-old", "crit-new", "info1"]);
});

// ─── Provider actions (admin/finance derivation) ─────────────────────────────

test("provider action summary covers proposed, approved and verification_pending", () => {
  const rows = [
    { id: "1", status: "proposed", operation_key: "shutdown", provider_name: "Railway", external_name: "db", system_name: "S", created_at: iso(-H) },
    { id: "2", status: "approved", operation_key: "shutdown", provider_name: "Railway", external_name: "db", system_name: "S", created_at: iso(-2 * H) },
    { id: "3", status: "verification_pending", operation_key: "scale", provider_name: "Railway", external_name: "app", system_name: "S", created_at: iso(-3 * H) },
    { id: "4", status: "completed", operation_key: "scale", provider_name: "Railway", external_name: "app", system_name: "S", created_at: iso(-4 * H) },
    { id: "5", status: "rejected", operation_key: "scale", provider_name: "Railway", external_name: "app", system_name: "S", created_at: iso(-5 * H) },
  ];
  const s = deriveProviderActionSummary(rows);
  assert.equal(s.proposed, 1);
  assert.equal(s.approved, 1);
  assert.equal(s.verificationPending, 1);
  assert.equal(s.total, 3);
  assert.equal(s.top.length, 3); // completed/rejected excluded from pending work
});

// ─── Monitoring ──────────────────────────────────────────────────────────────

test("monitoring summary counts enabled, failing and surfaces run evidence", () => {
  const rows = [
    { schedule_id: "a", provider_name: "Railway", account_name: "x", enabled: true, consecutive_failures: 3, last_run_status: "failed", last_run_at: iso(-H), next_run_at: iso(H) },
    { schedule_id: "b", provider_name: "Vercel", account_name: "y", enabled: true, consecutive_failures: 0, last_run_status: "completed", last_run_at: iso(-2 * H), next_run_at: iso(2 * H) },
    { schedule_id: "c", provider_name: "Railway", account_name: "z", enabled: false, consecutive_failures: 9, last_run_status: "failed", last_run_at: iso(-3 * H), next_run_at: null },
  ];
  const s = deriveMonitoringSummary(rows);
  assert.equal(s.enabled, 2);
  assert.equal(s.disabled, 1);
  assert.equal(s.failing, 1); // disabled schedule's failures do not count
  assert.equal(s.lastFailedRunAt, iso(-H));
  assert.equal(s.nextRunAt, iso(H));
});

// ─── Backups ─────────────────────────────────────────────────────────────────

test("backup summary distinguishes verified from merely successful evidence", () => {
  const rows = [
    { policy_id: "p1", policy_name: "DB daily", health: "healthy", last_completed_at: iso(-H), last_verified_at: iso(-H), next_due_at: iso(20 * H), last_failure_reason: null, last_event_at: iso(-H) },
    { policy_id: "p2", policy_name: "Files weekly", health: "unverified", last_completed_at: iso(-2 * H), last_verified_at: null, next_due_at: iso(5 * 24 * H), last_failure_reason: null, last_event_at: iso(-2 * H) },
    { policy_id: "p3", policy_name: "Blobs daily", health: "failed", last_completed_at: null, last_verified_at: null, next_due_at: null, last_failure_reason: "disk full", last_event_at: iso(-3 * H) },
  ];
  const s = deriveBackupSummary(rows);
  assert.equal(s.healthy, 1);
  assert.equal(s.unverified, 1);
  assert.equal(s.failed, 1);
  assert.equal(s.lastVerifiedAt, iso(-H)); // only p1 has verified evidence
  assert.equal(s.nextDueAt, iso(20 * H)); // earliest upcoming due
  assert.deepEqual(s.failedReasons, ["disk full"]);
});

test("no verified evidence yields null freshness, never an implied healthy claim", () => {
  const s = deriveBackupSummary([
    { policy_id: "p1", policy_name: "x", health: "unverified", last_completed_at: iso(-H), last_verified_at: null, next_due_at: null, last_failure_reason: null, last_event_at: iso(-H) },
  ]);
  assert.equal(s.lastVerifiedAt, null);
  assert.equal(s.nextDueAt, null);
});

// ─── Tasks & incidents ordering ──────────────────────────────────────────────

test("unfinished tasks sort overdue-first, then earliest due, then priority", () => {
  const tasks = [
    { id: "noDue", title: "", status: "open", priority: "urgent", due_at: null, created_at: iso(-H) },
    { id: "future", title: "", status: "open", priority: "urgent", due_at: iso(48 * H), created_at: iso(-H) },
    { id: "overdueNew", title: "", status: "in_progress", priority: "low", due_at: iso(-H), created_at: iso(-H) },
    { id: "overdueOld", title: "", status: "open", priority: "normal", due_at: iso(-10 * H), created_at: iso(-H) },
    { id: "done", title: "", status: "completed", priority: "urgent", due_at: iso(-100 * H), created_at: iso(-H) },
  ];
  const sorted = sortTasksForAttention(tasks, NOW);
  assert.deepEqual(sorted.map((t) => t.id), ["overdueOld", "overdueNew", "future", "noDue"]);
});

test("incident counts use accurate labels and unresolved sort by severity then age", () => {
  const incidents = [
    { id: "low", title: "", status: "investigating", severity: "low", opened_at: iso(-10 * H), created_at: iso(-10 * H) },
    { id: "crit", title: "", status: "acknowledged", severity: "critical", opened_at: iso(-2 * H), created_at: iso(-2 * H) },
    { id: "resolved", title: "", status: "resolved", severity: "critical", opened_at: iso(-20 * H), created_at: iso(-20 * H) },
    { id: "mon", title: "", status: "monitoring", severity: "high", opened_at: iso(-5 * H), created_at: iso(-5 * H) },
  ];
  const c = deriveIncidentCounts(incidents);
  assert.equal(c.active, 3); // acknowledged + investigating + monitoring, honestly labeled
  assert.equal(c.high_critical, 2); // resolved excluded
  const sorted = sortIncidentsForAttention(incidents);
  assert.deepEqual(sorted.map((i) => i.id), ["crit", "mon", "low"]);
});

// ─── Activity ────────────────────────────────────────────────────────────────

test("audit events map to labels and workflow destinations", () => {
  const item = describeAuditEvent({
    action: "incident.resolved",
    table_name: "incidents",
    record_id: "r1",
    created_at: iso(-H),
    actor: { full_name: "Jane Ops" },
  });
  assert.equal(item.label, "Incident resolved");
  assert.equal(item.href, "/admin/operations/incidents");
  assert.equal(item.detail, "by Jane Ops");
});

test("unknown audit actions get a readable fallback and safe destination", () => {
  const item = describeAuditEvent({ action: "custom.thing", table_name: "widgets", record_id: "x", created_at: iso(0), actor: null });
  assert.equal(item.label, "custom thing");
  assert.equal(item.href, "/admin/operations");
});

test("activity tables cover incidents, suspensions, tasks, provider ops, backups", () => {
  for (const t of ["incidents", "suspension_cases", "tasks", "provider_operation_proposals", "backup_events", "systems"]) {
    assert.ok(ACTIVITY_TABLES.includes(t), `missing ${t}`);
  }
  assert.ok(!ACTIVITY_TABLES.includes("invoices")); // financial events stay off the ops feed
});

// ─── Renewals ────────────────────────────────────────────────────────────────

test("renewal counts derive only renewal_state — no financial fields needed", () => {
  const s = deriveRenewalCounts([
    { id: "1", renewal_state: "upcoming" },
    { id: "2", renewal_state: "due" },
    { id: "3", renewal_state: "overdue" },
    { id: "4", renewal_state: "no_renewal" },
  ]);
  assert.deepEqual(s, { upcoming: 1, due: 1, overdue: 1 });
});
