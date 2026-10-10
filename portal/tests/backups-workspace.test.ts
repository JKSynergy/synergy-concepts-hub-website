// Backups workspace — classification, ordering, coverage-gap and filter tests.
// The core invariant: missing or failed evidence can never render as healthy.

import test from "node:test";
import assert from "node:assert/strict";
import {
  resolvePolicyHealth,
  sortPoliciesForAttention,
  filterPolicies,
  uncoveredSystems,
  deriveBackupOpsSummary,
  BACKUP_HEALTH_RANK,
  type PolicyListRow,
} from "../lib/operations/backups.ts";

const NOW = new Date("2026-10-20T12:00:00.000Z").getTime();
const H = 60 * 60 * 1000;
const iso = (o: number) => new Date(NOW + o).toISOString();

function row(p: Partial<PolicyListRow> & { id: string }): PolicyListRow {
  return {
    name: "policy",
    client_id: "c1",
    system_id: null,
    resource_id: "r1",
    health: "healthy",
    next_due_at: null,
    ...p,
  };
}

// ─── Health resolution ───────────────────────────────────────────────────────

test("every view-emitted health state resolves to itself", () => {
  for (const h of ["healthy", "due", "overdue", "failed", "unverified", "inactive"]) {
    assert.equal(resolvePolicyHealth(h), h);
  }
});

test("missing or unrecognized health evidence resolves to unknown, never healthy", () => {
  assert.equal(resolvePolicyHealth(null), "unknown");
  assert.equal(resolvePolicyHealth(undefined), "unknown");
  assert.equal(resolvePolicyHealth("corrupt-value"), "unknown");
  assert.notEqual(resolvePolicyHealth(null), "healthy");
});

// ─── Ordering ────────────────────────────────────────────────────────────────

test("urgency ordering: failed > overdue > unverified > due > unknown > healthy > inactive", () => {
  const sorted = sortPoliciesForAttention([
    row({ id: "inactive", health: "inactive" }),
    row({ id: "healthy", health: "healthy" }),
    row({ id: "unverified", health: "unverified" }),
    row({ id: "failed", health: "failed" }),
    row({ id: "unknown", health: "unknown" }),
    row({ id: "due", health: "due" }),
    row({ id: "overdue", health: "overdue" }),
  ]);
  assert.deepEqual(sorted.map((p) => p.id), ["failed", "overdue", "unverified", "due", "unknown", "healthy", "inactive"]);
});

test("within a state, earliest next-due surfaces first", () => {
  const sorted = sortPoliciesForAttention([
    row({ id: "later", health: "overdue", next_due_at: iso(-1 * H) }),
    row({ id: "earlier", health: "overdue", next_due_at: iso(-48 * H) }),
    row({ id: "nodate", health: "overdue", next_due_at: null }),
  ]);
  assert.deepEqual(sorted.map((p) => p.id), ["earlier", "later", "nodate"]);
});

test("a recent failure is not hidden by an older healthy ordering position", () => {
  // Failed policy created first must still outrank every healthy policy.
  const sorted = sortPoliciesForAttention([
    row({ id: "oldFailed", name: "z", health: "failed", next_due_at: iso(H) }),
    row({ id: "newHealthy", name: "a", health: "healthy", next_due_at: iso(-H) }),
  ]);
  assert.equal(sorted[0].id, "oldFailed");
});

// ─── Filtering ───────────────────────────────────────────────────────────────

test("filters compose: health + client + system + query", () => {
  const policies = [
    row({ id: "hit", health: "overdue", client_id: "c1", system_id: "s1", name: "nightly db", system: { name: "LMS" } }),
    row({ id: "wrongHealth", health: "healthy", client_id: "c1", system_id: "s1" }),
    row({ id: "wrongClient", health: "overdue", client_id: "c2", system_id: "s1" }),
    row({ id: "wrongSystem", health: "overdue", client_id: "c1", system_id: "s2" }),
    row({ id: "wrongText", health: "overdue", client_id: "c1", system_id: "s1", name: "unrelated" }),
  ];
  const out = filterPolicies(policies, { health: "overdue", clientId: "c1", systemId: "s1", query: "nightly" });
  assert.deepEqual(out.map((p) => p.id), ["hit"]);
});

// ─── Coverage gap ("not configured") ─────────────────────────────────────────

test("systems with no active policy surface as uncovered; inactive policies do not cover", () => {
  const systems = [
    { id: "s1", name: "LMS", client_id: "c1" },
    { id: "s2", name: "ERP", client_id: "c1" },
    { id: "s3", name: "Bookings", client_id: "c2" },
  ];
  const resources = [
    { id: "r1", system_id: "s1" },
    { id: "r2", system_id: null },
  ];
  const policies = [
    { is_active: true, system_id: null, resource_id: "r1" },   // covers s1 via resource
    { is_active: false, system_id: "s3", resource_id: "r9" },  // inactive — does NOT cover s3
  ];
  const uncovered = uncoveredSystems(systems, policies, resources);
  assert.deepEqual(uncovered.map((s) => s.id), ["s2", "s3"]);
});

test("direct system-linked policy covers the system", () => {
  const systems = [{ id: "s1", name: "LMS", client_id: "c1" }];
  const policies = [{ is_active: true, system_id: "s1", resource_id: "r1" }];
  assert.deepEqual(uncoveredSystems(systems, policies, []), []);
});

// ─── Summary ─────────────────────────────────────────────────────────────────

test("summary counts each state; needsAttention = failed + overdue + unverified", () => {
  const s = deriveBackupOpsSummary([
    { health: "failed" }, { health: "failed" }, { health: "overdue" },
    { health: "unverified" }, { health: "due" }, { health: "healthy" },
    { health: "inactive" }, { health: "unknown" },
  ]);
  assert.equal(s.failed, 2);
  assert.equal(s.overdue, 1);
  assert.equal(s.unverified, 1);
  assert.equal(s.needsAttention, 4);
  assert.equal(s.unknown, 1);
  assert.equal(s.healthy, 1);
});

test("all rank values exist for every workspace health state", () => {
  for (const h of ["healthy", "due", "overdue", "failed", "unverified", "inactive", "unknown"] as const) {
    assert.ok(BACKUP_HEALTH_RANK[h] !== undefined, `rank for ${h}`);
  }
});
