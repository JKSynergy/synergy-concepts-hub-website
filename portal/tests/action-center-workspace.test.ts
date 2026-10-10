// Action Center + Provider Actions — ordering, filtering, and transition-rule
// tests. Proves critical signals can't be buried under newer low-severity or
// terminal rows, the actionable definition matches the Operations Overview
// feed, retried/invalid review decisions are no-ops, and provider-operation
// proposals surface by workflow stage (display ordering only — transitions
// are enforced by the provider-operation RPCs and unique indexes).

import test from "node:test";
import assert from "node:assert/strict";
import {
  sortActionItems,
  filterActionItems,
  isActionableSignal,
  actionItemDecisionAllowed,
  ACTION_ITEM_DECISIONS,
  ACTIONABLE_SIGNAL_STATUSES,
  sortProposalsForAttention,
  sortReconItemsForAttention,
  type ActionItemRow,
  type OperationProposalRow,
  type ReconItemRow,
} from "../lib/operations/action-center.ts";

const NOW = new Date("2026-10-20T12:00:00.000Z").getTime();
const H = 60 * 60 * 1000;
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

function sig(partial: Partial<ActionItemRow> & { id: string }): ActionItemRow {
  return { status: "open", severity: "info", detected_at: iso(0), resolved_at: null, ...partial };
}

function prop(partial: Partial<OperationProposalRow> & { id: string }): OperationProposalRow {
  return { status: "proposed", created_at: iso(0), ...partial };
}

// ─── Signal ordering ─────────────────────────────────────────────────────────

test("actionable signals sort critical → warning → info, terminal last", () => {
  const sorted = sortActionItems([
    sig({ id: "infoNew", severity: "info", detected_at: iso(-1 * H) }),
    sig({ id: "resolvedNew", status: "resolved", resolved_at: iso(-0.5 * H), detected_at: iso(-2 * H) }),
    sig({ id: "critOld", severity: "critical", detected_at: iso(-50 * H) }),
    sig({ id: "warnOld", severity: "warning", status: "acknowledged", detected_at: iso(-30 * H) }),
  ]);
  assert.deepEqual(sorted.map((i) => i.id), ["critOld", "warnOld", "infoNew", "resolvedNew"]);
});

test("within a severity, oldest detected first — new items never bury old criticals", () => {
  const sorted = sortActionItems([
    sig({ id: "critNew", severity: "critical", detected_at: iso(-1 * H) }),
    sig({ id: "critOldest", severity: "critical", detected_at: iso(-90 * H) }),
    sig({ id: "critMid", severity: "critical", detected_at: iso(-10 * H) }),
  ]);
  assert.deepEqual(sorted.map((i) => i.id), ["critOldest", "critMid", "critNew"]);
});

test("terminal signals order newest resolution first; ordering is deterministic", () => {
  const sorted = sortActionItems([
    sig({ id: "dismissed", status: "dismissed", resolved_at: iso(-5 * H) }),
    sig({ id: "resolved", status: "resolved", resolved_at: iso(-1 * H) }),
  ]);
  assert.deepEqual(sorted.map((i) => i.id), ["resolved", "dismissed"]);

  const a = sig({ id: "a", detected_at: iso(-1 * H) });
  const b = sig({ id: "b", detected_at: iso(-1 * H) });
  assert.deepEqual(sortActionItems([b, a]).map((i) => i.id), ["a", "b"]);
});

// ─── Actionable definition — Overview parity ────────────────────────────────

test("actionable = open + acknowledged, matching the Overview feed predicate", () => {
  assert.deepEqual(ACTIONABLE_SIGNAL_STATUSES, ["open", "acknowledged"]);
  assert.equal(isActionableSignal(sig({ id: "o", status: "open" })), true);
  assert.equal(isActionableSignal(sig({ id: "a", status: "acknowledged" })), true);
  assert.equal(isActionableSignal(sig({ id: "r", status: "resolved" })), false);
  assert.equal(isActionableSignal(sig({ id: "d", status: "dismissed" })), false);
});

// ─── Filtering ───────────────────────────────────────────────────────────────

test("severity and source filters compose", () => {
  const items = [
    { ...sig({ id: "match", severity: "critical" }), source: "provider_monitoring" },
    { ...sig({ id: "wrongSev", severity: "warning" }), source: "provider_monitoring" },
    { ...sig({ id: "wrongSource", severity: "critical" }), source: "manual" },
  ];
  assert.deepEqual(
    filterActionItems(items, { severity: "critical", source: "provider_monitoring" }).map((i) => i.id),
    ["match"]
  );
});

// ─── Review decision rules ──────────────────────────────────────────────────

test("acknowledge only from open — a retried ack must not rewrite the reviewer", () => {
  assert.equal(actionItemDecisionAllowed("acknowledge", "open"), true);
  for (const bad of ["acknowledged", "resolved", "dismissed"]) {
    assert.equal(actionItemDecisionAllowed("acknowledge", bad), false, `ack from ${bad}`);
  }
  assert.deepEqual(ACTION_ITEM_DECISIONS.acknowledge, ["open"]);
});

test("resolve and dismiss allowed from open or acknowledged, never terminal", () => {
  for (const decision of ["resolve", "dismiss"] as const) {
    assert.equal(actionItemDecisionAllowed(decision, "open"), true);
    assert.equal(actionItemDecisionAllowed(decision, "acknowledged"), true);
    assert.equal(actionItemDecisionAllowed(decision, "resolved"), false);
    assert.equal(actionItemDecisionAllowed(decision, "dismissed"), false);
  }
});

// ─── Provider proposal ordering ──────────────────────────────────────────────

test("proposals surface by workflow stage: verify → decide → execute → in-flight → terminal", () => {
  const sorted = sortProposalsForAttention([
    prop({ id: "verified", status: "verified", created_at: iso(-1 * H) }),
    prop({ id: "proposed", status: "proposed", created_at: iso(-10 * H) }),
    prop({ id: "verifPending", status: "verification_pending", created_at: iso(-20 * H) }),
    prop({ id: "approved", status: "approved", created_at: iso(-5 * H) }),
    prop({ id: "failed", status: "failed", created_at: iso(-2 * H) }),
    prop({ id: "executing", status: "executing", created_at: iso(-3 * H) }),
  ]);
  assert.deepEqual(sorted.map((p) => p.id), [
    "verifPending", "proposed", "approved", "executing", "failed", "verified",
  ]);
});

test("within pending groups oldest proposal first; terminal newest-first", () => {
  const sorted = sortProposalsForAttention([
    prop({ id: "proposedNew", status: "proposed", created_at: iso(-1 * H) }),
    prop({ id: "proposedOld", status: "proposed", created_at: iso(-40 * H) }),
    prop({ id: "verifiedOld", status: "verified", created_at: iso(-50 * H) }),
    prop({ id: "verifiedNew", status: "verified", created_at: iso(-2 * H) }),
  ]);
  assert.deepEqual(sorted.map((p) => p.id), ["proposedOld", "proposedNew", "verifiedNew", "verifiedOld"]);
});

test("verification_failed groups with failed — it needs attention, not celebration", () => {
  const sorted = sortProposalsForAttention([
    prop({ id: "verified", status: "verified" }),
    prop({ id: "verifFailed", status: "verification_failed", created_at: iso(-5 * H) }),
    prop({ id: "proposed", status: "proposed", created_at: iso(-10 * H) }),
  ]);
  assert.equal(sorted.indexOf(sorted.find((p) => p.id === "verifFailed")!) <
    sorted.indexOf(sorted.find((p) => p.id === "verified")!), true);
  assert.equal(sorted[0].id, "proposed");
});

// ─── Reconciliation review-queue ordering ───────────────────────────────────

function recon(partial: Partial<ReconItemRow> & { id: string }): ReconItemRow {
  return { review_status: "pending_review", created_at: iso(0), ...partial };
}

test("reconciliation items surface pending_review → acknowledged → approved → terminal", () => {
  const sorted = sortReconItemsForAttention([
    recon({ id: "applied", review_status: "applied", created_at: iso(-1 * H) }),
    recon({ id: "approved", review_status: "approved", created_at: iso(-3 * H) }),
    recon({ id: "pendingOld", review_status: "pending_review", created_at: iso(-40 * H) }),
    recon({ id: "pendingNew", review_status: "pending_review", created_at: iso(-2 * H) }),
    recon({ id: "acked", review_status: "acknowledged", created_at: iso(-10 * H) }),
    recon({ id: "dismissed", review_status: "dismissed", created_at: iso(-0.5 * H) }),
  ]);
  assert.deepEqual(sorted.map((i) => i.id), [
    "pendingOld", "pendingNew", "acked", "approved", "dismissed", "applied",
  ]);
});
