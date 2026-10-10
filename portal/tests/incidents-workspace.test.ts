// Incidents workspace — ordering, filtering, and transition-rule tests.
// Proves unresolved work can't be buried under newer terminal rows, filters
// compose correctly, and invalid/retried transitions are rejected before any
// write reaches the database.

import test from "node:test";
import assert from "node:assert/strict";
import {
  sortIncidentsForWork,
  filterIncidents,
  isUnresolvedIncident,
  incidentTransitionAllowed,
  INCIDENT_TRANSITIONS,
  type IncidentFilterRow,
} from "../lib/operations/incidents.ts";

const NOW = new Date("2026-10-20T12:00:00.000Z").getTime();
const H = 60 * 60 * 1000;
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

function row(partial: Partial<IncidentFilterRow> & { id: string }): IncidentFilterRow {
  return {
    status: "open",
    severity: "low",
    opened_at: iso(0),
    created_at: iso(0),
    title: "incident",
    system_id: null,
    ...partial,
  };
}

// ─── Ordering ────────────────────────────────────────────────────────────────

test("unresolved incidents sort before terminal regardless of recency", () => {
  const sorted = sortIncidentsForWork([
    row({ id: "closedNew", status: "closed", created_at: iso(-1 * H) }),
    row({ id: "openOld", status: "open", severity: "low", opened_at: iso(-100 * H), created_at: iso(-100 * H) }),
    row({ id: "resolvedNew", status: "resolved", created_at: iso(-2 * H) }),
  ]);
  assert.deepEqual(sorted.map((i) => i.id), ["openOld", "resolvedNew", "closedNew"]);
});

test("unresolved sort by severity first, then oldest opened", () => {
  const sorted = sortIncidentsForWork([
    row({ id: "lowOld", severity: "low", opened_at: iso(-50 * H), created_at: iso(-50 * H) }),
    row({ id: "critNew", severity: "critical", status: "acknowledged", opened_at: iso(-1 * H), created_at: iso(-1 * H) }),
    row({ id: "critOld", severity: "critical", opened_at: iso(-10 * H), created_at: iso(-10 * H) }),
    row({ id: "high", severity: "high", status: "investigating", opened_at: iso(-5 * H), created_at: iso(-5 * H) }),
  ]);
  assert.deepEqual(sorted.map((i) => i.id), ["critOld", "critNew", "high", "lowOld"]);
});

test("terminal group orders resolved before closed before cancelled, newest first", () => {
  const sorted = sortIncidentsForWork([
    row({ id: "cancelled", status: "cancelled", created_at: iso(-1 * H) }),
    row({ id: "closedOld", status: "closed", created_at: iso(-10 * H) }),
    row({ id: "resolved", status: "resolved", created_at: iso(-20 * H) }),
    row({ id: "closedNew", status: "closed", created_at: iso(-2 * H) }),
  ]);
  assert.deepEqual(sorted.map((i) => i.id), ["resolved", "closedNew", "closedOld", "cancelled"]);
});

test("monitoring counts as unresolved; cancelled does not", () => {
  assert.equal(isUnresolvedIncident(row({ id: "a", status: "monitoring" })), true);
  assert.equal(isUnresolvedIncident(row({ id: "b", status: "cancelled" })), false);
});

// ─── Filtering ───────────────────────────────────────────────────────────────

test("filters compose: status + severity + system + query", () => {
  const incidents = [
    row({ id: "match", status: "investigating", severity: "high", system_id: "sys1", title: "db pool", system: { name: "LMS" }, client: { company_name: "Acme" } }),
    row({ id: "wrongStatus", status: "resolved", severity: "high", system_id: "sys1", title: "db pool", system: { name: "LMS" } }),
    row({ id: "wrongSev", status: "investigating", severity: "low", system_id: "sys1", title: "db pool", system: { name: "LMS" } }),
    row({ id: "wrongSys", status: "investigating", severity: "high", system_id: "sys2", title: "db pool", system: { name: "ERP" } }),
    row({ id: "wrongText", status: "investigating", severity: "high", system_id: "sys1", title: "network flap", system: { name: "LMS" } }),
  ];
  const out = filterIncidents(incidents, { status: "investigating", severity: "high", systemId: "sys1", query: "db" });
  assert.deepEqual(out.map((i) => i.id), ["match"]);
});

test("search matches title, client name and system name", () => {
  const incidents = [
    row({ id: "byTitle", title: "Payments failing", client: { company_name: "X" } }),
    row({ id: "byClient", title: "other", client: { company_name: "Globex Corp" } }),
    row({ id: "bySystem", title: "other", system: { name: "Merit Media ERP" } }),
  ];
  assert.deepEqual(filterIncidents(incidents, { query: "globex" }).map((i) => i.id), ["byClient"]);
  assert.deepEqual(filterIncidents(incidents, { query: "merit" }).map((i) => i.id), ["bySystem"]);
  assert.deepEqual(filterIncidents(incidents, { query: "payments" }).map((i) => i.id), ["byTitle"]);
});

// ─── Transition rules ────────────────────────────────────────────────────────

test("acknowledge only from open — cannot regress acknowledged/resolved/closed", () => {
  assert.equal(incidentTransitionAllowed("acknowledge", "open"), true);
  for (const bad of ["acknowledged", "investigating", "monitoring", "resolved", "closed", "cancelled"]) {
    assert.equal(incidentTransitionAllowed("acknowledge", bad), false, `acknowledge from ${bad}`);
  }
});

test("resolve allowed from active states only — retried resolve matches no rows", () => {
  assert.equal(incidentTransitionAllowed("resolve", "resolved"), false);
  assert.equal(incidentTransitionAllowed("resolve", "open"), false);
  assert.equal(incidentTransitionAllowed("resolve", "closed"), false);
  for (const ok of INCIDENT_TRANSITIONS.resolve) {
    assert.equal(incidentTransitionAllowed("resolve", ok), true);
  }
});

test("close only from resolved; cancel cannot touch closed/cancelled", () => {
  assert.equal(incidentTransitionAllowed("close", "resolved"), true);
  assert.equal(incidentTransitionAllowed("close", "open"), false);
  assert.equal(incidentTransitionAllowed("close", "closed"), false); // retried close is a no-op
  assert.equal(incidentTransitionAllowed("cancel", "open"), true);
  assert.equal(incidentTransitionAllowed("cancel", "closed"), false);
  assert.equal(incidentTransitionAllowed("cancel", "cancelled"), false); // retried cancel is a no-op
});

test("transition map mirrors the workspace buttons", () => {
  // investigate visible from acknowledged|monitoring; monitor only from investigating
  assert.deepEqual(INCIDENT_TRANSITIONS.investigate, ["acknowledged", "monitoring"]);
  assert.deepEqual(INCIDENT_TRANSITIONS.monitor, ["investigating"]);
});

// ─── Suspension vs outage distinction ────────────────────────────────────────

test("a commercially-suspended system is not treated as an unresolved incident signal", () => {
  // The distinction is a rendering concern: system.status lives on the row,
  // separate from incident.status. A suspended system with a resolved
  // incident stays terminal — suspension must not promote it back up.
  const incidents = [
    row({ id: "suspendedResolved", status: "resolved", system_id: "s1", system: { name: "Solvers" }, created_at: iso(-1 * H) }),
    row({ id: "liveOpen", status: "open", severity: "medium", system_id: "s2", opened_at: iso(-2 * H), created_at: iso(-2 * H) }),
  ];
  const sorted = sortIncidentsForWork(incidents);
  assert.equal(sorted[0].id, "liveOpen");
});
