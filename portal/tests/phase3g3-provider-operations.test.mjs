// Phase 3G-3: Controlled Provider Operations — tests.
// Validates: schema/RLS, closed operation vocabulary, proposal lifecycle,
// stale-basis protection, single-flight execution, normalized result handling,
// mandatory post-operation verification, RBAC, audit, delete safety, and the
// Supabase adapter's typed operations (fixture-level — fetch is stubbed; no
// live provider mutation is simulated into a pass).
//
// Privileged RPCs are service_role-only by design — invoked through asService,
// matching how the server actions call them.

import test from "node:test";
import assert from "node:assert/strict";
import { createDb, asUser, asService, rejects, q } from "./helpers/db.mjs";
import { supabaseAdapter } from "../lib/providers/supabase.ts";
import { railwayAdapter } from "../lib/providers/railway.ts";
import { vercelAdapter } from "../lib/providers/vercel.ts";
import { cloudflareAdapter } from "../lib/providers/cloudflare.ts";
import { providerSupportsOperation, PROVIDER_OPERATION_KEYS } from "../lib/providers/operations.ts";

const IDS = {
  provider: "cccc0000-0000-0000-0000-000000000001",
  providerRail: "cccc0000-0000-0000-0000-000000000009",
  account: "cccc0000-0000-0000-0000-000000000002",
  accountRail: "cccc0000-0000-0000-0000-00000000000a",
  sysA: "cccc0000-0000-0000-0000-000000000003",
  runD1: "cccc0000-0000-0000-0000-000000000020",
  runD2: "cccc0000-0000-0000-0000-000000000021",
  discLinked: "cccc0000-0000-0000-0000-000000000011",
  discUnlinked: "cccc0000-0000-0000-0000-000000000012",
  discMissing: "cccc0000-0000-0000-0000-000000000013",
};

const ADMIN = "00000000-0000-0000-0000-000000000001";
const STAFF = "00000000-0000-0000-0000-000000000002";
const FINANCE = "00000000-0000-0000-0000-000000000003";
const CLIENT_A = "00000000-0000-0000-0000-000000000004";

/** Run sql under the given execution context and assert it raises /pattern/. */
async function rejected(db, sql, role, pattern) {
  const promise = role === "service"
    ? asService(db, () => db.query(sql))
    : asUser(db, role === "staff" ? STAFF : role === "finance" ? FINANCE : CLIENT_A, () => db.query(sql));
  const err = await rejects(promise, sql.slice(0, 70));
  if (pattern) assert.match(String(err.message ?? err), pattern);
  return err;
}

async function setup(db) {
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${ADMIN}', 'admin@synergy.ug'), ('${STAFF}', 'staff@synergy.ug'),
      ('${FINANCE}', 'finance@synergy.ug'), ('${CLIENT_A}', 'clienta@company.com')
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.profiles (id, email, role) VALUES
      ('${ADMIN}', 'admin@synergy.ug', 'admin'), ('${STAFF}', 'staff@synergy.ug', 'staff'),
      ('${FINANCE}', 'finance@synergy.ug', 'finance'), ('${CLIENT_A}', 'clienta@company.com', 'client')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
    INSERT INTO public.providers (id, name, slug, adapter_key) VALUES
      ('${IDS.provider}', 'Supabase', 'supabase', 'supabase'),
      ('${IDS.providerRail}', 'Railway', 'railway', 'railway')
    ON CONFLICT DO NOTHING;
    INSERT INTO public.provider_accounts (id, provider_id, account_name, ownership, connection_status, credential_reference)
      VALUES ('${IDS.account}', '${IDS.provider}', 'SCH Supabase', 'sch_managed', 'connected', 'vault:test'),
             ('${IDS.accountRail}', '${IDS.providerRail}', 'SCH Railway', 'sch_managed', 'connected', 'vault:test')
    ON CONFLICT DO NOTHING;
    INSERT INTO public.systems (id, client_id, name, system_type, status)
      VALUES ('${IDS.sysA}', '${CLIENT_A}', 'Client A System', 'web_platform', 'live') ON CONFLICT DO NOTHING;
    INSERT INTO public.provider_discovery_runs (id, provider_account_id, status, started_at, completed_at)
      VALUES ('${IDS.runD1}', '${IDS.account}', 'completed', now() - interval '1 hour', now() - interval '1 hour'),
             ('${IDS.runD2}', '${IDS.account}', 'completed', now(), now())
    ON CONFLICT DO NOTHING;
  `);
}

async function insertDiscovered(db, id, { ext, name, status = "ACTIVE_HEALTHY", accountId = IDS.account, missing = false, runId = IDS.runD1 } = {}) {
  await asService(db, () => db.exec(`
    INSERT INTO public.provider_discovered_resources
      (id, provider_account_id, external_resource_id, resource_type, name, status, region, last_run_id, external_missing)
    VALUES ('${id}', '${accountId}', '${ext}', 'project', ${q(name)}, ${q(status)}, 'eu-west-1', '${runId}', ${missing})
    ON CONFLICT (id) DO NOTHING;
  `));
}

async function linkDiscovered(db, id) {
  return asService(db, () =>
    db.query(`SELECT public.link_discovered_resource('${id}', '${CLIENT_A}', '${IDS.sysA}', '${ADMIN}')`));
}

async function propose(db, discId, op = "pause_resource") {
  return asService(db, async () =>
    (await db.query(`SELECT public.propose_provider_operation('${discId}','${op}','test reason','${ADMIN}') AS id`)).rows[0].id);
}

async function review(db, proposalId, decision) {
  return asService(db, () =>
    db.query(`SELECT public.review_provider_operation('${proposalId}','${decision}','${ADMIN}')`));
}

async function begin(db, proposalId) {
  return asService(db, async () =>
    (await db.query(`SELECT public.begin_provider_operation_execution('${proposalId}','${ADMIN}') AS r`)).rows[0].r);
}

async function complete(db, execId, category) {
  return asService(db, async () =>
    (await db.query(`SELECT public.complete_provider_operation_execution('${execId}','${category}',NULL,NULL,NULL,'${ADMIN}') AS r`)).rows[0].r);
}

async function finishVerify(db, execId, outcome, observed) {
  return asService(db, async () =>
    (await db.query(`SELECT public.finish_provider_operation_verification('${execId}','${outcome}','${observed}','${ADMIN}') AS r`)).rows[0].r);
}

async function proposalStatus(db, id) {
  return (await db.query(`SELECT status FROM public.provider_operation_proposals WHERE id='${id}'`)).rows[0]?.status;
}

// ============================================================================
// 3G3-SCHEMA
// ============================================================================

test("3G3-SCHEMA-1: operation tables exist with RLS enabled", async () => {
  const db = await createDb();
  const t = await db.query(`
    SELECT t.table_name, c.relrowsecurity FROM information_schema.tables t
    JOIN pg_class c ON c.relname = t.table_name
    WHERE t.table_schema='public' AND t.table_name IN
      ('provider_operation_proposals','provider_operation_executions')`);
  assert.equal(t.rows.length, 2);
  assert.ok(t.rows.every((r) => r.relrowsecurity === true));
});

test("3G3-SCHEMA-2: closed operation vocabulary enforced", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discLinked, { ext: "3g3-linked", name: "linked-proj" });
  await linkDiscovered(db, IDS.discLinked);
  await rejected(db,
    `SELECT public.propose_provider_operation('${IDS.discLinked}','delete_resource','bad','${ADMIN}')`,
    "service", /Unsupported provider operation/);
  await rejected(db,
    `SELECT public.propose_provider_operation('${IDS.discLinked}','execute_provider_command','bad','${ADMIN}')`,
    "service", /Unsupported provider operation/);
});

test("3G3-SCHEMA-3: operation proposals/executions cannot be deleted", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discLinked, { ext: "3g3-linked", name: "linked-proj" });
  await linkDiscovered(db, IDS.discLinked);
  const pid = await propose(db, IDS.discLinked);
  const err = await rejects(
    asService(db, () => db.query(`DELETE FROM public.provider_operation_proposals WHERE id='${pid}'`)),
    "proposal delete");
  assert.match(err.message, /auditable history/);
});

// ============================================================================
// 3G3-PROP — proposal gates
// ============================================================================

test("3G3-PROP-1: proposal requires an explicitly linked resource", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discUnlinked, { ext: "3g3-unlinked", name: "unlinked-proj" });
  await rejected(db,
    `SELECT public.propose_provider_operation('${IDS.discUnlinked}','pause_resource','r','${ADMIN}')`,
    "service", /explicitly linked/);
});

test("3G3-PROP-2: proposal refused when resource missing externally", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discMissing, { ext: "3g3-missing", name: "missing-proj", missing: true });
  await linkDiscovered(db, IDS.discMissing);
  await rejected(db,
    `SELECT public.propose_provider_operation('${IDS.discMissing}','pause_resource','r','${ADMIN}')`,
    "service", /present externally/);
});

test("3G3-PROP-3: proposal captures basis run + snapshot", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discLinked, { ext: "3g3-linked", name: "linked-proj" });
  await linkDiscovered(db, IDS.discLinked);
  const pid = await propose(db, IDS.discLinked);
  const p = (await db.query(`SELECT * FROM public.provider_operation_proposals WHERE id='${pid}'`)).rows[0];
  assert.equal(p.status, "proposed");
  assert.equal(p.basis_run_id, IDS.runD1);
  assert.equal(p.basis_snapshot.status, "ACTIVE_HEALTHY");
  assert.equal(p.requested_by, ADMIN);
});

test("3G3-PROP-4: duplicate proposal returns the existing open proposal (idempotent)", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discLinked, { ext: "3g3-linked", name: "linked-proj" });
  await linkDiscovered(db, IDS.discLinked);
  const a = await propose(db, IDS.discLinked);
  const b = await propose(db, IDS.discLinked);
  assert.equal(a, b);
  const c = (await db.query(`SELECT count(*)::int c FROM public.provider_operation_proposals`)).rows[0].c;
  assert.equal(c, 1);
});

test("3G3-PROP-5: secret-shaped reason rejected", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discLinked, { ext: "3g3-linked", name: "linked-proj" });
  await linkDiscovered(db, IDS.discLinked);
  await rejected(db,
    `SELECT public.propose_provider_operation('${IDS.discLinked}','pause_resource','token sb_secret_abcdefghijklmnop','${ADMIN}')`,
    "service", /check constraint|secret/i);
});

// ============================================================================
// 3G3-REVIEW — approval lifecycle
// ============================================================================

test("3G3-REVIEW-1: approve/cancel transitions are enforced", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discLinked, { ext: "3g3-linked", name: "linked-proj" });
  await linkDiscovered(db, IDS.discLinked);

  const p1 = await propose(db, IDS.discLinked);
  await review(db, p1, "approve");
  assert.equal(await proposalStatus(db, p1), "approved");
  await rejected(db, `SELECT public.review_provider_operation('${p1}','approve','${ADMIN}')`,
    "service", /Only proposed operations can be approved/);
  await review(db, p1, "cancel");
  assert.equal(await proposalStatus(db, p1), "cancelled");
});

test("3G3-REVIEW-2: reject transition enforced", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discLinked, { ext: "3g3-linked", name: "linked-proj" });
  await linkDiscovered(db, IDS.discLinked);
  const pid = await propose(db, IDS.discLinked);
  await review(db, pid, "reject");
  assert.equal(await proposalStatus(db, pid), "rejected");
  await rejected(db, `SELECT public.review_provider_operation('${pid}','approve','${ADMIN}')`,
    "service", /Only proposed operations can be approved/);
});

test("3G3-REVIEW-3: execution refused before approval", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discLinked, { ext: "3g3-linked", name: "linked-proj" });
  await linkDiscovered(db, IDS.discLinked);
  const pid = await propose(db, IDS.discLinked);
  await rejected(db, `SELECT public.begin_provider_operation_execution('${pid}','${ADMIN}')`,
    "service", /must be approved/);
});

// ============================================================================
// 3G3-EXEC — execution gate + stale protection
// ============================================================================

test("3G3-EXEC-1: execution requires a connected account", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discLinked, { ext: "3g3-linked", name: "linked-proj" });
  await linkDiscovered(db, IDS.discLinked);
  const pid = await propose(db, IDS.discLinked);
  await review(db, pid, "approve");
  await asService(db, () => db.query(`UPDATE public.provider_accounts SET connection_status='failed' WHERE id='${IDS.account}'`));
  await rejected(db, `SELECT public.begin_provider_operation_execution('${pid}','${ADMIN}')`,
    "service", /not connected/);
});

test("3G3-EXEC-2: stale basis (newer observation) blocks execution and marks stale", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discLinked, { ext: "3g3-linked", name: "linked-proj" });
  await linkDiscovered(db, IDS.discLinked);
  const pid = await propose(db, IDS.discLinked);
  await review(db, pid, "approve");
  await asService(db, () => db.query(
    `UPDATE public.provider_discovered_resources SET last_run_id='${IDS.runD2}' WHERE id='${IDS.discLinked}'`));
  const res = await begin(db, pid);
  assert.equal(res.outcome, "stale");
  assert.equal(await proposalStatus(db, pid), "stale");
});

test("3G3-EXEC-3: external status drift since approval blocks execution", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discLinked, { ext: "3g3-linked", name: "linked-proj" });
  await linkDiscovered(db, IDS.discLinked);
  const pid = await propose(db, IDS.discLinked);
  await review(db, pid, "approve");
  await asService(db, () => db.query(
    `UPDATE public.provider_discovered_resources SET status='INACTIVE' WHERE id='${IDS.discLinked}'`));
  const res = await begin(db, pid);
  assert.equal(res.outcome, "stale");
});

test("3G3-EXEC-4: approved + fresh basis begins execution (single flight)", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discLinked, { ext: "3g3-linked", name: "linked-proj" });
  await linkDiscovered(db, IDS.discLinked);
  const pid = await propose(db, IDS.discLinked);
  await review(db, pid, "approve");
  const res = await begin(db, pid);
  assert.equal(res.outcome, "begin");
  assert.ok(res.execution_id);
  assert.equal(res.idempotency_key, `schop-${pid}`);
  assert.equal(await proposalStatus(db, pid), "executing");
  await rejected(db, `SELECT public.begin_provider_operation_execution('${pid}','${ADMIN}')`,
    "service", /must be approved/);
});

test("3G3-EXEC-5: transient result returns proposal to approved for safe retry", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discLinked, { ext: "3g3-linked", name: "linked-proj" });
  await linkDiscovered(db, IDS.discLinked);
  const pid = await propose(db, IDS.discLinked);
  await review(db, pid, "approve");
  const res = await begin(db, pid);
  const out = await complete(db, res.execution_id, "execution_unknown");
  assert.equal(out, "approved");
  assert.equal(await proposalStatus(db, pid), "approved");
  const res2 = await begin(db, pid);
  assert.equal(res2.idempotency_key, res.idempotency_key);
});

test("3G3-EXEC-6: definitive failure marks proposal failed", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discLinked, { ext: "3g3-linked", name: "linked-proj" });
  await linkDiscovered(db, IDS.discLinked);
  const pid = await propose(db, IDS.discLinked);
  await review(db, pid, "approve");
  const res = await begin(db, pid);
  const out = await complete(db, res.execution_id, "auth_failed");
  assert.equal(out, "failed");
  assert.equal(await proposalStatus(db, pid), "failed");
});

// ============================================================================
// 3G3-VERIFY — mandatory post-operation verification
// ============================================================================

test("3G3-VERIFY-1: verified outcome updates SCH external state only", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discLinked, { ext: "3g3-linked", name: "linked-proj" });
  await linkDiscovered(db, IDS.discLinked);
  const pid = await propose(db, IDS.discLinked);
  await review(db, pid, "approve");
  const res = await begin(db, pid);
  const out = await complete(db, res.execution_id, "success");
  assert.equal(out, "verification_pending");
  assert.equal(await proposalStatus(db, pid), "verification_pending");

  const fin = await finishVerify(db, res.execution_id, "verified", "INACTIVE");
  assert.equal(fin, "verified");
  assert.equal(await proposalStatus(db, pid), "verified");
  const r = (await db.query(`
    SELECT r.external_status, r.status FROM public.resources r
    JOIN public.provider_discovered_resources d ON d.linked_resource_id=r.id
    WHERE d.id='${IDS.discLinked}'`)).rows[0];
  assert.equal(r.external_status, "INACTIVE");
  assert.equal(r.status, "active"); // SCH lifecycle untouched
});

test("3G3-VERIFY-2: verification mismatch is not success", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discLinked, { ext: "3g3-linked", name: "linked-proj" });
  await linkDiscovered(db, IDS.discLinked);
  const pid = await propose(db, IDS.discLinked);
  await review(db, pid, "approve");
  const res = await begin(db, pid);
  await complete(db, res.execution_id, "success");
  const fin = await finishVerify(db, res.execution_id, "mismatch", "ACTIVE_HEALTHY");
  assert.equal(fin, "verification_failed");
  assert.equal(await proposalStatus(db, pid), "verification_failed");
});

test("3G3-VERIFY-3: provider still transitioning stays pending", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discLinked, { ext: "3g3-linked", name: "linked-proj" });
  await linkDiscovered(db, IDS.discLinked);
  const pid = await propose(db, IDS.discLinked);
  await review(db, pid, "approve");
  const res = await begin(db, pid);
  await complete(db, res.execution_id, "accepted");
  const fin = await finishVerify(db, res.execution_id, "pending", "GOING_DOWN");
  assert.equal(fin, "verification_pending");
  assert.equal(await proposalStatus(db, pid), "verification_pending");
});

// ============================================================================
// 3G3-RBAC — role boundaries
// ============================================================================

test("3G3-RBAC-1: staff/finance/client cannot call operation RPCs", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discLinked, { ext: "3g3-linked", name: "linked-proj" });
  await linkDiscovered(db, IDS.discLinked);
  const pid = await propose(db, IDS.discLinked);

  // Functions are revoked from authenticated — any end user gets denied.
  for (const role of ["staff", "finance", "client"]) {
    await rejected(db,
      `SELECT public.review_provider_operation('${pid}','approve','${STAFF}')`,
      role, /permission denied|Only administrators/i);
    await rejected(db,
      `SELECT public.begin_provider_operation_execution('${pid}','${STAFF}')`,
      role, /permission denied|Only administrators/i);
  }
});

test("3G3-RBAC-2: finance reads overview; staff/client see zero rows", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discLinked, { ext: "3g3-linked", name: "linked-proj" });
  await linkDiscovered(db, IDS.discLinked);
  await propose(db, IDS.discLinked);

  const fin = await asUser(db, FINANCE, () =>
    db.query(`SELECT count(*)::int c FROM public.provider_operation_overview`));
  assert.ok(fin.rows[0].c >= 1);

  const staffRows = await asUser(db, STAFF, () =>
    db.query(`SELECT count(*)::int c FROM public.provider_operation_proposals`));
  assert.equal(staffRows.rows[0].c, 0);
  const staffView = await asUser(db, STAFF, () =>
    db.query(`SELECT count(*)::int c FROM public.provider_operation_overview`));
  assert.equal(staffView.rows[0].c, 0);
  const clientView = await asUser(db, CLIENT_A, () =>
    db.query(`SELECT count(*)::int c FROM public.provider_operation_overview`));
  assert.equal(clientView.rows[0].c, 0);
});

test("3G3-RBAC-3: finance writes are filtered by RLS", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discLinked, { ext: "3g3-linked", name: "linked-proj" });
  await linkDiscovered(db, IDS.discLinked);
  const pid = await propose(db, IDS.discLinked);
  await asUser(db, FINANCE, () =>
    db.query(`UPDATE public.provider_operation_proposals SET status='approved' WHERE id='${pid}'`));
  assert.equal(await proposalStatus(db, pid), "proposed");
});

// ============================================================================
// 3G3-AUDIT
// ============================================================================

test("3G3-AUDIT-1: full lifecycle is audited with safe metadata", async () => {
  const db = await createDb();
  await setup(db);
  await insertDiscovered(db, IDS.discLinked, { ext: "3g3-linked", name: "linked-proj" });
  await linkDiscovered(db, IDS.discLinked);
  const pid = await propose(db, IDS.discLinked);
  await review(db, pid, "approve");
  const res = await begin(db, pid);
  await complete(db, res.execution_id, "success");
  await finishVerify(db, res.execution_id, "verified", "INACTIVE");

  const actions = (await db.query(`
    SELECT DISTINCT action FROM public.audit_logs
    WHERE table_name IN ('provider_operation_proposals','provider_operation_executions')`)).rows.map(r => r.action);
  for (const a of [
    "provider_operation.proposed", "provider_operation.approved",
    "provider_operation.started", "provider_operation.execution_started",
    "provider_operation.completed", "provider_operation.verified",
  ]) {
    assert.ok(actions.includes(a), `missing audit ${a}`);
  }
  const leak = (await db.query(`
    SELECT count(*)::int c FROM public.audit_logs
    WHERE action LIKE 'provider_operation.%' AND details::text ~* 'sb_secret|sk_live|access_token'`)).rows[0].c;
  assert.equal(leak, 0);
});

// ============================================================================
// 3G3-ADAPTER — typed capability matrix (fixture level; fetch stubbed)
// ============================================================================

test("3G3-ADAPTER-1: supabase pause/resume on project only; other providers not supported", () => {
  assert.ok(supabaseAdapter.operations?.supportsOperation("pause_resource", "project"));
  assert.ok(supabaseAdapter.operations?.supportsOperation("resume_resource", "project"));
  assert.equal(supabaseAdapter.operations?.supportsOperation("pause_resource", "database"), false);
  assert.equal(railwayAdapter.operations, undefined);
  assert.equal(vercelAdapter.operations, undefined);
  assert.equal(cloudflareAdapter.operations, undefined);
  assert.equal(providerSupportsOperation("supabase", "pause_resource", "project"), true);
  assert.equal(providerSupportsOperation("railway", "pause_resource", "service"), false);
  assert.equal(providerSupportsOperation("vercel", "pause_resource", "hosting"), false);
  assert.equal(providerSupportsOperation("cloudflare", "pause_resource", "zone"), false);
  assert.ok(PROVIDER_OPERATION_KEYS.every((k) => ["pause_resource", "resume_resource"].includes(k)));
});

test("3G3-ADAPTER-2: supabase pause calls POST /pause and verify reads status (fixture)", async () => {
  const calls = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method ?? "GET" });
    if (String(url).endsWith("/pause")) {
      return new Response(JSON.stringify({ id: "proj-1" }), { status: 200 });
    }
    return new Response(JSON.stringify({ id: "proj-1", status: "INACTIVE" }), { status: 200 });
  };
  try {
    const res = await supabaseAdapter.operations.executeOperation({
      creds: { token: "fixture" }, operation: "pause_resource",
      externalResourceId: "proj-1", resourceType: "project", idempotencyKey: "schop-x",
    });
    assert.equal(res.category, "success");
    assert.ok(calls[0].url.endsWith("/v1/projects/proj-1/pause"));
    assert.equal(calls[0].method, "POST");
    const v = await supabaseAdapter.operations.verifyOperation({
      creds: { token: "fixture" }, operation: "pause_resource",
      externalResourceId: "proj-1", resourceType: "project", idempotencyKey: "schop-x",
    });
    assert.equal(v.outcome, "verified");
    assert.equal(v.observedStatus, "INACTIVE");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("3G3-ADAPTER-3: verify reports pending during transition and mismatch on wrong state (fixture)", async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const status = String(url).includes("proj-pending") ? "GOING_DOWN" : "ACTIVE_HEALTHY";
    return new Response(JSON.stringify({ id: "p", status }), { status: 200 });
  };
  try {
    const pend = await supabaseAdapter.operations.verifyOperation({
      creds: { token: "f" }, operation: "pause_resource",
      externalResourceId: "proj-pending", resourceType: "project", idempotencyKey: "k",
    });
    assert.equal(pend.outcome, "pending");
    const mis = await supabaseAdapter.operations.verifyOperation({
      creds: { token: "f" }, operation: "pause_resource",
      externalResourceId: "proj-active", resourceType: "project", idempotencyKey: "k",
    });
    assert.equal(mis.outcome, "mismatch");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("3G3-ADAPTER-4: mutation allowlist blocks non-declared paths (fixture)", async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("{}", { status: 200 });
  try {
    const { providerMutate } = await import("../lib/providers/http.ts");
    const err = await providerMutate(
      [{ host: "api.supabase.com", pathPrefix: "/v1/projects/", pathSuffix: "/pause", methods: ["POST"] }],
      "https://api.supabase.com/v1/projects/proj-1/api-keys",
      "fixture"
    ).then(() => null).catch((e) => e);
    assert.ok(err, "expected allowlist rejection");
    assert.match(String(err.message), /allowlist/i);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("3G3-ADAPTER-5: timeout maps to execution_unknown, not success (fixture)", async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new DOMException("timed out", "TimeoutError"); };
  try {
    const { providerMutate } = await import("../lib/providers/http.ts");
    const res = await providerMutate(
      [{ host: "api.supabase.com", pathPrefix: "/v1/projects/", pathSuffix: "/pause", methods: ["POST"] }],
      "https://api.supabase.com/v1/projects/proj-1/pause", "fixture");
    assert.equal(res.category, "execution_unknown");
  } finally {
    globalThis.fetch = origFetch;
  }
});
