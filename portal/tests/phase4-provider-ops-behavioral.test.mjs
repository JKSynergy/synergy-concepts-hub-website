// Phase 4 — behavioral tests for the real verifyProviderOperation application
// path. The module loader redirects @/lib/supabase/*, @/lib/providers/registry
// and next/cache to PGlite-backed stubs; all other dependencies (roles,
// operations catalogue, the action itself, and the real reclaim/verify/finish
// RPCs in Postgres) execute for real.

import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./helpers/p4-ops-loader.mjs", import.meta.url);

import { createDb, asService } from "./helpers/db.mjs";
import { __setDb, __setRpcOverride } from "./helpers/p4-shim.mjs";
import { __setUser } from "./helpers/stub-supabase-server.mjs";
import { __setVerifyOutcome } from "./helpers/stub-registry.mjs";

const { verifyProviderOperation } = await import("../lib/actions/provider-operations.ts");

const uuid = () => crypto.randomUUID();
const ADMIN_ID = uuid();
const STAFF_ID = uuid();
const CLIENT_ID = uuid();

const propStatus = (db, id) =>
  db.query(`SELECT status FROM public.provider_operation_proposals WHERE id='${id}'`)
    .then((r) => r.rows[0].status);
const execRow = (db, id) =>
  db.query(`SELECT * FROM public.provider_operation_executions WHERE id='${id}'`)
    .then((r) => r.rows[0]);

async function setup(db) {
  await db.query(
    `INSERT INTO auth.users (id, email) VALUES
       ('${ADMIN_ID}','beh-admin@test.dev'),('${STAFF_ID}','beh-staff@test.dev'),('${CLIENT_ID}','beh-client@test.dev')`);
  await db.query(`UPDATE public.profiles SET role='admin' WHERE id='${ADMIN_ID}'`);
  await db.query(`UPDATE public.profiles SET role='staff' WHERE id='${STAFF_ID}'`);
}

async function seedExecuting({ aged = true } = {}) {
  const p = uuid(), acct = uuid(), run = uuid(), disc = uuid(), sysId = uuid();
  await db.exec(`
    INSERT INTO public.providers (id, name, slug, adapter_key)
      VALUES ('${p}','Beh Provider','beh-p','supabase');
    INSERT INTO public.provider_accounts (id, provider_id, account_name, ownership, connection_status, credential_reference)
      VALUES ('${acct}','${p}','beh-acct','sch_managed','connected','vault:beh');
    INSERT INTO public.systems (id, client_id, name, system_type, status)
      VALUES ('${sysId}','${CLIENT_ID}','Beh System','web_platform','live');
    INSERT INTO public.provider_discovery_runs (id, provider_account_id, status, started_at, completed_at)
      VALUES ('${run}','${acct}','completed', now(), now());
    INSERT INTO public.provider_discovered_resources
      (id, provider_account_id, external_resource_id, resource_type, name, status, last_run_id, external_missing)
      VALUES ('${disc}','${acct}','ext-beh-1','project','beh-proj','ACTIVE_HEALTHY','${run}', false);
  `);
  await asService(db, () => db.query(
    `SELECT public.link_discovered_resource('${disc}','${CLIENT_ID}','${sysId}','${ADMIN_ID}')`));
  const pid = (await asService(db, () => db.query(
    `SELECT public.propose_provider_operation('${disc}','pause_resource','behavioral test','${ADMIN_ID}') AS id`))).rows[0].id;
  await asService(db, () => db.query(`SELECT public.review_provider_operation('${pid}','approve','${ADMIN_ID}')`));
  const execId = (await asService(db, () => db.query(
    `SELECT (public.begin_provider_operation_execution('${pid}','${ADMIN_ID}')->>'execution_id')::uuid AS e`))).rows[0].e;
  if (aged) {
    await db.query(
      `UPDATE public.provider_operation_executions SET started_at = now() - interval '1 hour' WHERE id='${execId}'`);
  }
  return { pid, execId };
}

let db;

async function actingAs(userId, fn) {
  __setUser({ id: userId });
  // Give the SECURITY DEFINER RPC guards a caller identity.
  await db.query(`SELECT set_config('request.jwt.claim.sub','${userId}',false)`);
  return fn();
}

test.beforeEach(async () => {
  db = await createDb();
  __setDb(db);
  __setVerifyOutcome({ outcome: "verified", observedStatus: "INACTIVE" });
  await setup(db);
  // Credential resolution is not under test — return a valid credential shape.
  __setRpcOverride((name) =>
    name === "reveal_provider_credential"
      ? { data: JSON.stringify({ token: "test-token", accountId: "acct-1" }), error: null }
      : undefined);
});

test("P4-BEH-1 first Verify on wedged proposal reclaims and verifies in one attempt", async () => {

  const { pid, execId } = await seedExecuting({ aged: true });

  const res = await actingAs(ADMIN_ID, () => verifyProviderOperation(pid));

  assert.equal(res.ok, true, res.error);
  assert.equal(res.data?.outcome ?? res.data?.status ?? "verified", "verified");
  assert.equal(await propStatus(db, pid), "verified");
  assert.equal((await execRow(db, execId)).status, "verified");
});

test("P4-BEH-2 fresh executing execution is reported in-flight, not reclaimed", async () => {

  const { pid, execId } = await seedExecuting({ aged: false });

  const res = await actingAs(ADMIN_ID, () => verifyProviderOperation(pid));

  assert.equal(res.ok, false);
  assert.match(res.error, /in-flight/i);
  assert.equal((await execRow(db, execId)).status, "executing");
  assert.equal(await propStatus(db, pid), "executing");
});

test("P4-BEH-3 normal verification_pending path resolves via fresh read", async () => {

  const { pid, execId } = await seedExecuting();
  await db.query(
    `UPDATE public.provider_operation_executions SET status='completed', completed_at=now()
      WHERE id='${execId}'`);
  await db.query(
    `UPDATE public.provider_operation_proposals SET status='verification_pending' WHERE id='${pid}'`);

  const res = await actingAs(ADMIN_ID, () => verifyProviderOperation(pid));

  assert.equal(res.ok, true, res.error);
  assert.equal(await propStatus(db, pid), "verified");
});

test("P4-BEH-4 a concurrent no-op reclaim is handled honestly", async () => {

  const { pid } = await seedExecuting({ aged: true });

  // Simulate another caller winning the reclaim race but leaving the
  // execution in a non-verifiable state: the RPC reports not_stuck and the
  // fresh read must find nothing awaiting verification — an honest error,
  // never a fabricated success.
  __setRpcOverride((name) =>
    name === "reclaim_stuck_provider_executions"
      ? { data: { reclaimed: 0, reason: "not_stuck" }, error: null }
      : name === "reveal_provider_credential"
        ? { data: JSON.stringify({ token: "t", accountId: "a" }), error: null }
        : undefined);

  const res = await actingAs(ADMIN_ID, () => verifyProviderOperation(pid));

  assert.equal(res.ok, false);
  assert.equal(res.error, "No execution awaiting verification");
  assert.equal(await propStatus(db, pid), "executing");
});

test("P4-BEH-5 provider mismatch ends verification_failed and cannot re-execute", async () => {

  const { pid } = await seedExecuting({ aged: true });
  __setVerifyOutcome({ outcome: "mismatch", observedStatus: "RUNNING" });

  const res = await actingAs(ADMIN_ID, () => verifyProviderOperation(pid));

  assert.equal(res.ok, false);
  assert.match(res.error, /does not match/i);
  assert.equal(await propStatus(db, pid), "verification_failed");

  // A failed proposal must not become executable again.
  const err = await db.query(
    `SELECT public.begin_provider_operation_execution('${pid}', 'k', '${uuid()}')`)
    .then(() => null, (e) => e);
  assert.ok(err);
});

test("P4-BEH-6 unverifiable provider response stays verification_pending honestly", async () => {

  const { pid } = await seedExecuting({ aged: true });
  __setVerifyOutcome({ outcome: "pending", observedStatus: "PENDING" });

  const res = await actingAs(ADMIN_ID, () => verifyProviderOperation(pid));

  assert.equal(res.data?.status, "verification_pending");
  assert.match(res.error, /transitioning/i);
  assert.equal(await propStatus(db, pid), "verification_pending");
});

test("P4-BEH-7 non-admin callers are denied before any state change", async () => {

  const { pid } = await seedExecuting({ aged: true });

  const res = await actingAs(STAFF_ID, () => verifyProviderOperation(pid));

  assert.equal(res.ok, false);
  assert.match(res.error, /permission denied/i);
  assert.equal(await propStatus(db, pid), "executing");
});
