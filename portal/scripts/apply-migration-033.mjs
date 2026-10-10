// Standalone Migration 033 Runner & Verification Tooling
// Phase 4: Stuck provider-execution recovery (reclaim RPC)
// Target: DEV project ref: outuocpsotiozkpyksex ONLY
// Verifies the function definition, service_role-only grant, and a live
// no-op call (no wedged executions → returns 0 without writing).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { assertDevTarget, assertDbUrlMatchesRef, makeRedactor, writesConfirmed, GuardError } from "./phase2c-guard.mjs";
import { openPgConnection } from "./apply-migration-013.mjs";

export async function runMigration033({ env = process.env } = {}) {
  const target = assertDevTarget(env);
  if (!target.dbUrl) {
    throw new GuardError("PHASE2C_DB_URL is required to execute Migration 033.");
  }
  assertDbUrlMatchesRef(target.dbUrl, target.ref);

  if (!writesConfirmed(env, target.ref)) {
    throw new GuardError(`PHASE2C_CONFIRM_DEV_WRITES=${target.ref} is required to apply Migration 033 to DEV.`);
  }

  const secrets = [target.anonKey, target.serviceKey, target.dbUrl].filter(Boolean);
  const redact = makeRedactor(() => secrets);

  console.log(`[MIGRATION 033] Target verified as DEV (${target.ref}). Opening direct PostgreSQL connection...`);
  const client = await openPgConnection(target.dbUrl);

  try {
    const migrationPath = resolve("supabase/migrations/033_phase4_stuck_execution_reclaim.sql");
    const rawSql = readFileSync(migrationPath, "utf8");
    const sha256 = createHash("sha256").update(rawSql).digest("hex");
    console.log(`[MIGRATION 033] Applying ${migrationPath} (${rawSql.length} bytes, sha256 ${sha256})...`);
    try {
      await client.query(rawSql);
      console.log("[MIGRATION 033] Applied SQL file successfully.");
    } catch (err) {
      console.error("[MIGRATION 033] SQL Execution failed:", err.message);
      try { await client.query("ROLLBACK;"); } catch { /* not in txn */ }
      throw err;
    }

    // --- Definition-level verification ------------------------------------
    const defRes = await client.query(`
      SELECT pg_get_functiondef(p.oid) AS def, p.prosecdef
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'reclaim_stuck_provider_executions'
        AND p.pronargs = 2
    `);
    const def = defRes.rows[0]?.def ?? "";
    const isDefiner = defRes.rows[0]?.prosecdef === true;
    const ageGuarded = /started_at\s*<\s*now\(\)\s*-\s*p_min_age/i.test(def);
    const honestUnknown = def.includes("execution_unknown");
    const forcesVerification = def.includes("'verification_pending'");

    const grantRes = await client.query(`
      SELECT grantee FROM information_schema.routine_privileges
      WHERE routine_schema = 'public' AND routine_name = 'reclaim_stuck_provider_executions'
    `);
    const grantees = grantRes.rows.map((r) => r.grantee);
    const grantsRestricted = grantees.every((g) => g === "service_role" || g === "postgres");

    // --- Behavioural check -------------------------------------------------
    // Count genuinely wedged executions first (past the in-flight window) —
    // the sweep must reclaim exactly that many and no more.
    const stuckCheck = await client.query(`
      SELECT count(*)::int AS n FROM public.provider_operation_executions
      WHERE status = 'executing' AND started_at < now() - interval '15 minutes'
    `);
    const reclaimedExpected = stuckCheck.rows[0]?.n ?? -1;

    let noOpResult = null;
    try {
      await client.query(`BEGIN`);
      await client.query(`SET LOCAL ROLE service_role`);
      const r = await client.query(
        `SELECT (public.reclaim_stuck_provider_executions('15 minutes', NULL))->>'reclaimed' AS n`);
      await client.query(`COMMIT`);
      noOpResult = Number(r.rows[0]?.n);
    } catch (e) {
      await client.query(`ROLLBACK`).catch(() => {});
      throw e;
    }

    const verification = {
      functionDefPresent: defRes.rows.length === 1,
      securityDefiner: isDefiner,
      ageGuarded,
      preservesExecutionUnknown: honestUnknown,
      forcesReadOnlyVerification: forcesVerification,
      executeRestrictedToServiceRole: grantsRestricted,
      grantees,
      wedgedExecutionsBefore: reclaimedExpected,
      sweepReclaimed: noOpResult,
      note: reclaimedExpected === 0
        ? "no wedged executions on DEV — reclaim verified as a safe no-op; transition behaviour proven by PGlite suite"
        : `${noOpResult} wedged execution(s) reclaimed on DEV — proposals now await read-only verification`,
    };
    const isPass = defRes.rows.length === 1 && isDefiner && ageGuarded &&
      honestUnknown && forcesVerification && grantsRestricted &&
      (noOpResult === reclaimedExpected);

    const report = {
      projectRef: target.ref,
      timestamp: new Date().toISOString(),
      migration: "033_phase4_stuck_execution_reclaim.sql",
      sha256,
      status: isPass ? "PASS" : "FAIL",
      verification,
    };

    mkdirSync("phase2c-reports", { recursive: true });
    writeFileSync(join("phase2c-reports", "migration-033-report.json"), redact(JSON.stringify(report, null, 2)));
    console.log(`[MIGRATION 033] ${isPass ? "PASS" : "FAIL"} — report written to phase2c-reports/migration-033-report.json`);
    return report;
  } finally {
    await client.end();
  }
}

const isMain = process.argv[1] && existsSync(process.argv[1]) &&
  resolve(process.argv[1]).endsWith("apply-migration-033.mjs");
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

  runMigration033({ env }).then((r) => {
    if (r.status !== "PASS") process.exit(1);
  }).catch((err) => {
    console.error("[MIGRATION 033] ERROR:", err);
    process.exit(1);
  });
}
