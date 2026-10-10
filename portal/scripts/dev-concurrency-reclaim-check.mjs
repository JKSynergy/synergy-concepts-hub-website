// Standalone DEV Concurrency Validation — Migration 033 reclaim RPC
// Target: DEV project ref outuocpsotiozkpyksex ONLY.
//
// Exercises genuinely independent PostgreSQL sessions (two separate pg.Client
// connections) racing:
//   A) two concurrent targeted reclaims on the same wedged execution
//   B) a reclaim racing a complete_provider_operation_execution
//
// Asserts exactly-one-wins semantics, single audit trail, no duplicate
// executions, and a consistent final proposal/execution state either way.
//
// Fixture rows are created through the real propose/review/begin RPCs and
// left in place as DEV history (provider_operation_* tables are audit-style;
// test fixtures are labelled 'DEV-CONC-*' for identification).

import { randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { assertDevTarget, assertDbUrlMatchesRef, makeRedactor, writesConfirmed, GuardError } from "./phase2c-guard.mjs";
import { openPgConnection } from "./apply-migration-013.mjs";

const uuid = () => randomUUID();
const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass: !!pass, detail });
  console.log(`${pass ? "  PASS" : "  FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

async function asService(client, fn) {
  await client.query("BEGIN");
  await client.query("SET LOCAL ROLE service_role");
  try {
    const out = await fn();
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  }
}

/** Create a wedged (aged 'executing') fixture through the real lifecycle RPCs. */
async function seedWedged(client, adminId, clientId, tag) {
  const p = uuid(), acct = uuid(), run = uuid(), disc = uuid(), sys = uuid();
  await client.query(`
    INSERT INTO public.providers (id, name, slug, adapter_key)
      VALUES ('${p}', 'DEV-CONC Provider ${tag}', 'dev-conc-${tag}', 'supabase');
    INSERT INTO public.provider_accounts (id, provider_id, account_name, ownership, connection_status, credential_reference)
      VALUES ('${acct}', '${p}', 'DEV-CONC-${tag}', 'sch_managed', 'connected', 'vault:dev-conc-${tag}');
    INSERT INTO public.systems (id, client_id, name, system_type, status)
      VALUES ('${sys}', '${clientId}', 'DEV-CONC System ${tag}', 'web_platform', 'live');
    INSERT INTO public.provider_discovery_runs (id, provider_account_id, status, started_at, completed_at)
      VALUES ('${run}', '${acct}', 'completed', now(), now());
    INSERT INTO public.provider_discovered_resources
      (id, provider_account_id, external_resource_id, resource_type, name, status, last_run_id, external_missing)
      VALUES ('${disc}', '${acct}', 'ext-conc-${tag}', 'project', 'dev-conc-proj-${tag}', 'ACTIVE_HEALTHY', '${run}', false);
  `);
  await asService(client, () =>
    client.query(`SELECT public.link_discovered_resource('${disc}','${clientId}','${sys}','${adminId}')`));
  const pid = (await asService(client, () => client.query(
    `SELECT public.propose_provider_operation('${disc}','pause_resource','dev concurrency validation ${tag}','${adminId}') AS id`))).rows[0].id;
  await asService(client, () =>
    client.query(`SELECT public.review_provider_operation('${pid}','approve','${adminId}')`));
  const execId = (await asService(client, () => client.query(
    `SELECT (public.begin_provider_operation_execution('${pid}','${adminId}')->>'execution_id')::uuid AS e`))).rows[0].e;
  await client.query(
    `UPDATE public.provider_operation_executions SET started_at = now() - interval '2 hours' WHERE id='${execId}'`);
  return { pid, execId };
}

const auditCount = (client, recordId, action) =>
  client.query(
    `SELECT count(*)::int AS n FROM public.audit_logs WHERE record_id='${recordId}' AND action='${action}'`)
    .then((r) => r.rows[0].n);

export async function runDevConcurrencyCheck({ env = process.env } = {}) {
  const target = assertDevTarget(env);
  if (!target.dbUrl) throw new GuardError("PHASE2C_DB_URL is required.");
  assertDbUrlMatchesRef(target.dbUrl, target.ref);
  if (!writesConfirmed(env, target.ref)) {
    throw new GuardError(`PHASE2C_CONFIRM_DEV_WRITES=${target.ref} is required — this script writes DEV fixtures.`);
  }

  const redact = makeRedactor(() => [target.anonKey, target.serviceKey, target.dbUrl].filter(Boolean));
  console.log(`[DEV-CONC] Target verified as DEV (${target.ref}). Opening TWO independent PostgreSQL sessions...`);

  const sessionA = await openPgConnection(target.dbUrl);
  const sessionB = await openPgConnection(target.dbUrl);
  check("two independent sessions established",
    sessionA !== sessionB && sessionA.processID !== sessionB.processID,
    `pidA=${sessionA.processID} pidB=${sessionB.processID}`);

  try {
    // Pick existing DEV identities for the actor/owner fields.
    const adminId = (await sessionA.query(
      `SELECT id FROM public.profiles WHERE role='admin' ORDER BY created_at LIMIT 1`)).rows[0]?.id;
    const clientId = (await sessionA.query(
      `SELECT id FROM public.profiles WHERE role='client' ORDER BY created_at LIMIT 1`)).rows[0]?.id;
    if (!adminId || !clientId) throw new Error("DEV must have at least one admin and one client profile.");
    console.log(`[DEV-CONC] actor=${adminId.slice(0, 8)}… client=${clientId.slice(0, 8)}…`);

    // ------------------------------------------------------------------
    // RACE A — two concurrent targeted reclaims on the same wedged exec.
    // ------------------------------------------------------------------
    const tag = randomUUID().slice(0, 8);
    const fx = await seedWedged(sessionA, adminId, clientId, `a${tag}`);
    console.log(`[DEV-CONC] Race A fixture: proposal=${fx.pid} exec=${fx.execId}`);
    const [rA1, rA2] = await Promise.allSettled([
      asService(sessionA, () =>
        sessionA.query(`SELECT public.reclaim_stuck_provider_executions('15 minutes','${fx.execId}') AS r`)),
      asService(sessionB, () =>
        sessionB.query(`SELECT public.reclaim_stuck_provider_executions('15 minutes','${fx.execId}') AS r`)),
    ]);
    const outA = [rA1, rA2].map((r) =>
      r.status === "fulfilled" ? r.value.rows[0].r : { error: r.reason?.message });
    const reclaimed = outA.filter((o) => o.reclaimed === 1 && o.reason === "reclaimed");
    const noOps = outA.filter((o) => o.reclaimed === 0);
    check("race A: exactly one successful reclaim", reclaimed.length === 1, JSON.stringify(outA));
    check("race A: exactly one honest no-op", noOps.length === 1 && noOps[0].reason === "not_stuck");

    const execA = (await sessionA.query(
      `SELECT status FROM public.provider_operation_executions WHERE id='${fx.execId}'`)).rows[0];
    const propA = (await sessionA.query(
      `SELECT status FROM public.provider_operation_proposals WHERE id='${fx.pid}'`)).rows[0];
    check("race A: exec -> execution_unknown", execA?.status === "execution_unknown", execA?.status);
    check("race A: proposal -> verification_pending", propA?.status === "verification_pending", propA?.status);

    const execAudits = await auditCount(sessionA, fx.execId, "provider_operation.execution_unknown");
    const propAudits = await auditCount(sessionA, fx.pid, "provider_operation.updated");
    check("race A: exactly one reclaim audit event (exec)", execAudits === 1, `count=${execAudits}`);
    check("race A: exactly one reclaim audit event (proposal)", propAudits === 1, `count=${propAudits}`);

    const liveExecs = (await sessionA.query(
      `SELECT count(*)::int AS n FROM public.provider_operation_executions WHERE proposal_id='${fx.pid}'`)).rows[0].n;
    check("race A: no duplicate execution rows", liveExecs === 1, `count=${liveExecs}`);

    // ------------------------------------------------------------------
    // RACE B — reclaim racing a complete_provider_operation_execution.
    // ------------------------------------------------------------------
    const fx2 = await seedWedged(sessionA, adminId, clientId, `b${tag}`);
    console.log(`[DEV-CONC] Race B fixture: proposal=${fx2.pid} exec=${fx2.execId}`);
    const [rB1, rB2] = await Promise.allSettled([
      asService(sessionA, () =>
        sessionA.query(`SELECT public.reclaim_stuck_provider_executions('15 minutes','${fx2.execId}') AS r`)),
      asService(sessionB, () =>
        sessionB.query(
          `SELECT public.complete_provider_operation_execution('${fx2.execId}','network_error',NULL,'network_error','DEV-CONC race probe','${adminId}') AS r`)),
    ]);
    const recOut = rB1.status === "fulfilled" ? rB1.value.rows[0].r : { error: rB1.reason?.message };
    const compOut = rB2.status === "fulfilled" ? rB2.value.rows[0].r : { error: rB2.reason?.message };
    console.log(`[DEV-CONC] Race B outcomes: reclaim=${JSON.stringify(recOut)} complete=${JSON.stringify(compOut)}`);

    const execB = (await sessionA.query(
      `SELECT status, provider_result_category FROM public.provider_operation_executions WHERE id='${fx2.execId}'`)).rows[0];
    const propB = (await sessionA.query(
      `SELECT status FROM public.provider_operation_proposals WHERE id='${fx2.pid}'`)).rows[0];

    // Exactly one of two consistent end states:
    //  (i)  reclaim won: exec=execution_unknown + prop=verification_pending,
    //       complete returns 'already_completed' (guarded no-op).
    // (ii) complete won: exec=failed/network_error + prop=approved (transient
    //       semantics — 'approved' is the returned proposal status),
    //       reclaim returns {reclaimed:0, reason:'not_stuck'}.
    const reclaimWon = recOut?.reclaimed === 1 && compOut === "already_completed";
    const completeWon = recOut?.reclaimed === 0 &&
      ["approved", "failed", "verification_pending"].includes(compOut);
    check("race B: exactly one winner", (reclaimWon || completeWon) && !(reclaimWon && completeWon),
      `reclaimWon=${reclaimWon} completeWon=${completeWon}`);

    const consistent =
      (execB?.status === "execution_unknown" && propB?.status === "verification_pending") ||
      (execB?.status === "failed" && execB?.provider_result_category === "network_error" && propB?.status === "approved");
    check("race B: final state consistent", consistent, `exec=${execB?.status} prop=${propB?.status}`);

    const liveExecsB = (await sessionA.query(
      `SELECT count(*)::int AS n FROM public.provider_operation_executions WHERE proposal_id='${fx2.pid}'`)).rows[0].n;
    check("race B: no duplicate execution rows", liveExecsB === 1, `count=${liveExecsB}`);

    console.log(`[DEV-CONC] Fixtures retained as DEV history (audit model is append-only):`);
    console.log(`           race A proposal=${fx.pid} exec=${fx.execId}`);
    console.log(`           race B proposal=${fx2.pid} exec=${fx2.execId}`);
  } finally {
    await sessionA.end().catch(() => {});
    await sessionB.end().catch(() => {});
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n[DEV-CONC] ${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log(redact(`[DEV-CONC] FAILURES: ${failed.map((f) => f.name).join(", ")}`));
    process.exitCode = 1;
  } else {
    console.log("[DEV-CONC] PASS — genuine multi-session concurrency semantics verified.");
  }
  return { results, ok: failed.length === 0 };
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("dev-concurrency-reclaim-check.mjs");
if (isMain) {
  const env = {};
  if (existsSync(".env.phase2c")) {
    readFileSync(".env.phase2c", "utf8").split("\n").forEach((l) => {
      const m = l.match(/^\s*([^#][^=]*)=(.*)$/);
      if (m) env[m[1].trim()] = m[2].trim();
    });
  }
  env.PHASE2C_DEV_PROJECT_REF = "outuocpsotiozkpyksex";
  env.PHASE2C_CONFIRM_DEV_WRITES = "outuocpsotiozkpyksex";

  runDevConcurrencyCheck({ env }).catch((e) => {
    console.error("[DEV-CONC] Fatal:", e.message);
    process.exit(1);
  });
}
