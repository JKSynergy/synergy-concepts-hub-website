// Suspensions workspace — ordering, filtering, transition guards and
// case/system discrepancy tests.
// Core invariant: a case's workflow state and the application's real
// systems.status are separate truths — discrepancies surface, never reconcile.

import test from "node:test";
import assert from "node:assert/strict";
import {
  CASE_TRANSITIONS,
  ACTION_COMPLETABLE_STATUSES,
  caseTransitionAllowed,
  sortCasesForAttention,
  filterCases,
  caseSystemDiscrepancy,
  isSuspendedSystem,
} from "../lib/operations/suspensions.ts";
import { suspendedSystems } from "../lib/operations/overview.ts";

const NOW = new Date("2026-10-20T12:00:00.000Z").getTime();
const H = 60 * 60 * 1000;
const iso = (o: number) => new Date(NOW + o).toISOString();

function caseRow(p: { id: string } & Partial<Parameters<typeof sortCasesForAttention>[0][number] & { status: string; reason: string }>) {
  return { status: "proposed", requested_at: iso(0), created_at: iso(0), reason: "non-payment", ...p };
}

// ─── Ordering ────────────────────────────────────────────────────────────────

test("cases needing decisions or mid-flight sort before steady/terminal states", () => {
  const sorted = sortCasesForAttention([
    caseRow({ id: "restored", status: "restored", created_at: iso(-H) }),
    caseRow({ id: "suspended", status: "suspended", created_at: iso(-H) }),
    caseRow({ id: "pending", status: "pending_approval", created_at: iso(-H) }),
    caseRow({ id: "executing", status: "executing", created_at: iso(-H) }),
    caseRow({ id: "restorePend", status: "restoration_pending", created_at: iso(-H) }),
  ]);
  assert.deepEqual(sorted.map((c) => c.id), ["pending", "executing", "restorePend", "suspended", "restored"]);
});

test("active work ages forward; terminal cases newest first", () => {
  const sorted = sortCasesForAttention([
    caseRow({ id: "oldPending", status: "pending_approval", requested_at: iso(-48 * H), created_at: iso(-48 * H) }),
    caseRow({ id: "newPending", status: "proposed", requested_at: iso(-H), created_at: iso(-H) }),
    caseRow({ id: "newClosed", status: "cancelled", created_at: iso(-1 * H) }),
    caseRow({ id: "oldClosed", status: "rejected", created_at: iso(-50 * H) }),
  ]);
  assert.deepEqual(sorted.map((c) => c.id), ["oldPending", "newPending", "newClosed", "oldClosed"]);
});

// ─── Filtering ───────────────────────────────────────────────────────────────

test("status + text filters compose over reason/client/agreement", () => {
  const cases = [
    { ...caseRow({ id: "hit", status: "suspended", reason: "non-payment overdue" }), client: { company_name: "Acme" }, service_agreement: { name: "Gold SLA" } },
    { ...caseRow({ id: "wrongStatus", status: "restored", reason: "non-payment overdue" }), client: { company_name: "Acme" } },
    { ...caseRow({ id: "wrongClient", status: "suspended", reason: "non-payment overdue" }), client: { company_name: "Other" } },
  ];
  const out = filterCases(cases, { status: "suspended", query: "acme" });
  assert.deepEqual(out.map((c) => c.id), ["hit"]);
});

// ─── Transition rules ────────────────────────────────────────────────────────

test("approve/reject only from proposed or pending_approval", () => {
  for (const from of ["proposed", "pending_approval"]) {
    assert.equal(caseTransitionAllowed("approve", from), true);
    assert.equal(caseTransitionAllowed("reject", from), true);
  }
  for (const bad of ["approved", "executing", "suspended", "restored", "rejected", "cancelled"]) {
    assert.equal(caseTransitionAllowed("approve", bad), false, `approve from ${bad}`);
    assert.equal(caseTransitionAllowed("reject", bad), false, `reject from ${bad}`);
  }
});

test("execute requires approval path; retried execute on suspended is rejected", () => {
  assert.equal(caseTransitionAllowed("execute_start", "approved"), true);
  assert.equal(caseTransitionAllowed("execute_start", "executing"), false); // already started
  assert.equal(caseTransitionAllowed("execute", "approved"), true);
  assert.equal(caseTransitionAllowed("execute", "executing"), true);
  assert.equal(caseTransitionAllowed("execute", "suspended"), false); // repeated execute no-ops
  assert.equal(caseTransitionAllowed("execute", "proposed"), false);
});

test("restoration only from suspended lineage; cancel blocked on terminal", () => {
  assert.equal(caseTransitionAllowed("initiate_restoration", "suspended"), true);
  assert.equal(caseTransitionAllowed("initiate_restoration", "restoration_pending"), false); // retry no-ops
  assert.equal(caseTransitionAllowed("complete_restoration", "restoration_pending"), true);
  assert.equal(caseTransitionAllowed("complete_restoration", "restored"), false);
  assert.equal(caseTransitionAllowed("cancel", "restored"), false);
  assert.equal(caseTransitionAllowed("cancel", "rejected"), false);
  assert.equal(caseTransitionAllowed("cancel", "cancelled"), false); // retry no-ops
  assert.equal(caseTransitionAllowed("cancel", "proposed"), true);
});

test("action completion allowed from pending/in_progress/failed, not completed/verified", () => {
  assert.ok(ACTION_COMPLETABLE_STATUSES.includes("pending"));
  assert.ok(ACTION_COMPLETABLE_STATUSES.includes("in_progress"));
  assert.ok(ACTION_COMPLETABLE_STATUSES.includes("failed"));
  assert.ok(!ACTION_COMPLETABLE_STATUSES.includes("completed" as never));
  assert.ok(!ACTION_COMPLETABLE_STATUSES.includes("verified" as never));
});

// ─── Case vs system-state discrepancies ──────────────────────────────────────

test("active case + live system surfaces as a discrepancy", () => {
  assert.equal(caseSystemDiscrepancy("suspended", "live"), "case_active_system_live");
  assert.equal(caseSystemDiscrepancy("executing", "live"), "case_active_system_live");
  assert.equal(caseSystemDiscrepancy("restoration_pending", "live"), "case_active_system_live");
  assert.equal(caseSystemDiscrepancy("suspended", "suspended"), null);
});

test("closed case + still-suspended system surfaces independently", () => {
  assert.equal(caseSystemDiscrepancy("restored", "suspended"), "case_closed_system_suspended");
  assert.equal(caseSystemDiscrepancy("cancelled", "suspended"), "case_closed_system_suspended");
  assert.equal(caseSystemDiscrepancy("restored", "live"), null);
});

test("missing/unknown system status makes no discrepancy claim", () => {
  assert.equal(caseSystemDiscrepancy("suspended", null), null);
  assert.equal(caseSystemDiscrepancy("restored", undefined), null);
});

// ─── Consistency with Operations Overview ────────────────────────────────────

test("suspended system without a case is still counted (shared definition)", () => {
  const systems = [
    { id: "s1", name: "Solvers", status: "suspended", suspended_at: iso(-H) },
    { id: "s2", name: "LMS", status: "live", suspended_at: null },
  ];
  // Same predicate the Overview uses — no competing definition.
  assert.equal(suspendedSystems(systems).length, 1);
  assert.equal(suspendedSystems(systems)[0].id, "s1");
  assert.equal(isSuspendedSystem(systems[0]), true);
  assert.equal(isSuspendedSystem(systems[1]), false);
});

test("a live system is never application-suspended even with an active case", () => {
  const sys = { id: "s1", status: "live" };
  assert.equal(isSuspendedSystem(sys), false);
  assert.equal(caseSystemDiscrepancy("suspended", "live"), "case_active_system_live");
});
