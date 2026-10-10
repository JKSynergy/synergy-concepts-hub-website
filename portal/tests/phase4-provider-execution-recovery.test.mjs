// Phase 4: Provider operation stuck-execution recovery (migration 033).
// Covers reclaim_stuck_provider_executions: age-guarded atomic reclaim of
// 'executing' executions, honest execution_unknown semantics, forced read-only
// verification before retry, single-flight preservation, idempotent reclaims,
// and the service_role-only grant. PGlite harness — RPCs called via asService
// exactly as the server actions invoke them.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDb, asUser, asService, rejects } from "./helpers/db.mjs";

const ADMIN = "00000000-0000-0000-0000-000000000001";
const STAFF = "00000000-0000-0000-0000-000000000002";
const CLIENT_A = "00000000-0000-0000-0000-000000000004";
const IDS = {
  provider: "cccc0000-0000-0000-0000-000000000001",
  account: "cccc0000-0000-0000-0000-000000000002",
  sysA: "cccc0000-0000-0000-0000-000000000003",
  runD1: "cccc0000-0000-0000-0000-000000000020",
  disc: "cccc0000-0000-0000-0000-000000000011",
};

async function setup(db) {
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${ADMIN}', 'admin@synergy.ug'), ('${STAFF}', 'staff@synergy.ug'),
      ('${CLIENT_A}', 'clienta@company.com') ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.profiles (id, email, role) VALUES
      ('${ADMIN}', 'admin@synergy.ug', 'admin'), ('${STAFF}', 'staff@synergy.ug', 'staff'),
      ('${CLIENT_A}', 'clienta@company.com', 'client')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
    INSERT INTO public.providers (id, name, slug, adapter_key) VALUES
      ('${IDS.provider}', 'Supabase', 'supabase', 'supabase') ON CONFLICT DO NOTHING;
    INSERT INTO public.provider_accounts (id, provider_id, account_name, ownership, connection_status, credential_reference)
      VALUES ('${IDS.account}', '${IDS.provider}', 'SCH Supabase', 'sch_managed', 'connected', 'vault:test')
      ON CONFLICT DO NOTHING;
    INSERT INTO public.systems (id, client_id, name, system_type, status)
      VALUES ('${IDS.sysA}', '${CLIENT_A}', 'Client A System', 'web_platform', 'live') ON CONFLICT DO NOTHING;
    INSERT INTO public.provider_discovery_runs (id, provider_account_id, status, started_at, completed_at)
      VALUES ('${IDS.runD1}', '${IDS.account}', 'completed', now(), now()) ON CONFLICT DO NOTHING;
    INSERT INTO public.provider_discovered_resources
      (id, provider_account_id, external_resource_id, resource_type, name, status, last_run_id, external_missing)
      VALUES ('${IDS.disc}', '${IDS.account}', 'rec-proj', 'project', 'recovery-proj', 'ACTIVE_HEALTHY', '${IDS.runD1}', false)
      ON CONFLICT (id) DO NOTHING;
  `);
}

async function seedExecuting(db) {
  await asService(db, () => db.query(
    `SELECT public.link_discovered_resource('${IDS.disc}', '${CLIENT_A}', '${IDS.sysA}', '${ADMIN}')`));
  const pid = (await asService(db, () => db.query(
    `SELECT public.propose_provider_operation('${IDS.disc}','pause_resource','recovery test','${ADMIN}') AS id`))).rows[0].id;
  await asService(db, () => db.query(`SELECT public.review_provider_operation('${pid}','approve','${ADMIN}')`));
  const execId = (await asService(db, () => db.query(
    `SELECT (public.begin_provider_operation_execution('${pid}','${ADMIN}')->>'execution_id')::uuid AS e`))).rows[0].e;
  return { pid, execId };
}

const reclaimRaw = (db, execId = null, age = "15 minutes") =>
  asService(db, async () =>
    (await db.query(`SELECT public.reclaim_stuck_provider_executions('${age}'::interval, ${execId ? `'${execId}'` : "NULL"}) AS r`)).rows[0].r);
const reclaim = async (db, execId = null, age = "15 minutes") => (await reclaimRaw(db, execId, age)).reclaimed;

const execRow = (db, id) => db.query(`SELECT * FROM public.provider_operation_executions WHERE id='${id}'`).then((r) => r.rows[0]);
const propStatus = (db, id) => db.query(`SELECT status FROM public.provider_operation_proposals WHERE id='${id}'`).then((r) => r.rows[0].status);

test("P4-REC-1 fresh executing execution is NOT reclaimed (age guard)", async () => {
  const db = await createDb();
  await setup(db);
  const { pid, execId } = await seedExecuting(db);

  const res = await reclaimRaw(db, execId);
  assert.equal(res.reclaimed, 0);
  assert.equal(res.reason, "too_recent");
  assert.equal((await execRow(db, execId)).status, "executing");
  assert.equal(await propStatus(db, pid), "executing");
});

test("P4-REC-2 aged executing execution is reclaimed to execution_unknown + verification_pending", async () => {
  const db = await createDb();
  await setup(db);
  const { pid, execId } = await seedExecuting(db);
  // Simulate a wedged execution whose in-flight window has long passed.
  await db.query(`UPDATE public.provider_operation_executions SET started_at = now() - interval '1 hour' WHERE id='${execId}'`);

  const res = await reclaimRaw(db, execId);
  assert.equal(res.reclaimed, 1);
  assert.equal(res.reason, "reclaimed");

  const exec = await execRow(db, execId);
  assert.equal(exec.status, "execution_unknown");
  assert.equal(exec.provider_result_category, "execution_unknown");
  assert.match(exec.safe_error_message, /verification required/i);
  assert.ok(exec.completed_at);
  assert.equal(await propStatus(db, pid), "verification_pending");
});

test("P4-REC-3 reclaimed execution resolves through the existing verify path", async () => {
  const db = await createDb();
  await setup(db);
  const { pid, execId } = await seedExecuting(db);
  await db.query(`UPDATE public.provider_operation_executions SET started_at = now() - interval '1 hour' WHERE id='${execId}'`);
  assert.equal(await reclaim(db, execId), 1);

  // Provider DID apply the operation before the crash — verify confirms it.
  const r = (await asService(db, () => db.query(
    `SELECT public.finish_provider_operation_verification('${execId}','verified','INACTIVE','${ADMIN}') AS r`))).rows[0].r;
  assert.equal(r, "verified");
  assert.equal((await execRow(db, execId)).status, "verified");
  assert.equal(await propStatus(db, pid), "verified");
});

test("P4-REC-4 reclaimed execution with provider mismatch is NOT success", async () => {
  const db = await createDb();
  await setup(db);
  const { pid, execId } = await seedExecuting(db);
  await db.query(`UPDATE public.provider_operation_executions SET started_at = now() - interval '1 hour' WHERE id='${execId}'`);
  await reclaim(db, execId);

  await asService(db, () => db.query(
    `SELECT public.finish_provider_operation_verification('${execId}','mismatch','ACTIVE_HEALTHY','${ADMIN}')`));
  assert.equal(await propStatus(db, pid), "verification_failed");
});

test("P4-REC-5 duplicate reclaim is a guarded no-op — no double transition", async () => {
  const db = await createDb();
  await setup(db);
  const { pid, execId } = await seedExecuting(db);
  await db.query(`UPDATE public.provider_operation_executions SET started_at = now() - interval '1 hour' WHERE id='${execId}'`);

  assert.equal(await reclaim(db, execId), 1);
  assert.equal(await reclaim(db, execId), 0); // already resolved
  assert.equal(await propStatus(db, pid), "verification_pending");

  // The proposal audit trigger emitted exactly one transition event.
  const { rows } = await db.query(
    `SELECT action FROM public.audit_logs WHERE record_id='${pid}' AND action='provider_operation.updated'`);
  assert.equal(rows.length, 1);
});

test("P4-REC-6 single-flight preserved: reclaimed proposal cannot begin a new execution", async () => {
  const db = await createDb();
  await setup(db);
  const { pid, execId } = await seedExecuting(db);
  await db.query(`UPDATE public.provider_operation_executions SET started_at = now() - interval '1 hour' WHERE id='${execId}'`);
  await reclaim(db, execId);

  const err = await rejects(
    asService(db, () => db.query(`SELECT public.begin_provider_operation_execution('${pid}','${ADMIN}')`)),
    "begin on verification_pending");
  assert.match(err.message, /awaiting verification/i);
});

test("P4-REC-7 authenticated callers cannot invoke the reclaim RPC", async () => {
  const db = await createDb();
  await setup(db);
  const { execId } = await seedExecuting(db);
  await db.query(`UPDATE public.provider_operation_executions SET started_at = now() - interval '1 hour' WHERE id='${execId}'`);

  const err = await rejects(
    asUser(db, ADMIN, () => db.query(`SELECT public.reclaim_stuck_provider_executions('15 minutes','${execId}')`)),
    "authenticated reclaim");
  assert.match(err.message, /permission denied for function|Only administrators may reclaim/i);
  assert.equal((await execRow(db, execId)).status, "executing");
});

test("P4-REC-8 pending verification keeps the proposal awaiting re-check", async () => {
  const db = await createDb();
  await setup(db);
  const { pid, execId } = await seedExecuting(db);
  await db.query(`UPDATE public.provider_operation_executions SET started_at = now() - interval '1 hour' WHERE id='${execId}'`);
  await reclaim(db, execId);

  const r = (await asService(db, () => db.query(
    `SELECT public.finish_provider_operation_verification('${execId}','pending','PAUSING','${ADMIN}') AS r`))).rows[0].r;
  assert.equal(r, "verification_pending");
  assert.equal((await execRow(db, execId)).status, "verification_pending");
  assert.equal(await propStatus(db, pid), "verification_pending");
});

test("P4-REC-8b invalid p_min_age is rejected outright", async () => {
  const db = await createDb();
  await setup(db);
  const { execId } = await seedExecuting(db);

  for (const bad of ["0 seconds", "-5 minutes"]) {
    const err = await rejects(
      asService(db, () => db.query(`SELECT public.reclaim_stuck_provider_executions('${bad}'::interval,'${execId}')`)),
      `reclaim with ${bad}`);
    assert.match(err.message, /positive interval/i);
  }
  assert.equal((await execRow(db, execId)).status, "executing");
});

test("P4-REC-8c targeted reclaim distinguishes not_found and not_stuck", async () => {
  const db = await createDb();
  await setup(db);
  const { pid, execId } = await seedExecuting(db);

  // Missing execution.
  let res = await reclaimRaw(db, "99999999-9999-9999-9999-999999999999");
  assert.equal(res.reclaimed, 0);
  assert.equal(res.reason, "not_found");

  // Execution already resolved (not stuck): complete it then reclaim.
  await db.query(`UPDATE public.provider_operation_executions SET started_at = now() - interval '1 hour' WHERE id='${execId}'`);
  await reclaimRaw(db, execId);
  res = await reclaimRaw(db, execId);
  assert.equal(res.reclaimed, 0);
  assert.equal(res.reason, "not_stuck");
  assert.equal(await propStatus(db, pid), "verification_pending");
});

test("P4-REC-9 server action hardens the adapter/result/verification error paths", () => {
  const src = readFileSync("lib/actions/provider-operations.ts", "utf8");
  // Adapter exceptions become execution_unknown — never a definite failure.
  assert.ok(/try \{[\s\S]*?executeOperation\(opReq\)[\s\S]*?\} catch/.test(src),
    "executeOperation must be wrapped in try/catch");
  assert.ok(src.includes('category: "execution_unknown"'),
    "adapter throw must record execution_unknown");
  // complete/finish RPC errors must be inspected, not ignored.
  assert.ok(src.includes("completeErr"), "complete_provider_operation_execution error must be checked");
  assert.ok(src.includes("finErr"), "finish_provider_operation_verification error must be checked");
  assert.ok(src.includes("reclaim_stuck_provider_executions"),
    "verify path must reclaim wedged executions");
});
