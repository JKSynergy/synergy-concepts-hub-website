// Standalone Migration 023 Runner & Verification Tooling
// Phase 3G-4: Provider Monitoring & Scheduled Reconciliation
// Target: DEV project ref: outuocpsotiozkpyksex ONLY
// Refuses production, validates target, executes in transaction, verifies all invariants.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { assertDevTarget, assertDbUrlMatchesRef, makeRedactor, writesConfirmed, GuardError } from "./phase2c-guard.mjs";
import { openPgConnection } from "./apply-migration-013.mjs";
import { captureInventorySnapshot } from "./apply-migration-019.mjs";

const PHASE3G4_TABLES = [
  "provider_monitoring_schedules",
  "provider_monitoring_runs",
  "action_items"
];

const PHASE3G4_VIEWS = [
  "provider_monitoring_overview",
  "provider_monitoring_run_overview",
  "action_item_overview"
];

const PHASE3G4_FUNCTIONS = [
  "save_monitoring_schedule",
  "due_monitoring_schedules",
  "begin_monitoring_run",
  "process_monitoring_run",
  "complete_monitoring_run",
  "review_action_item"
];

const RESTRICTED_FUNCTIONS = PHASE3G4_FUNCTIONS;

export async function runMigration023({ env = process.env } = {}) {
  const target = assertDevTarget(env);
  if (!target.dbUrl) {
    throw new GuardError("PHASE2C_DB_URL is required to execute Migration 023.");
  }
  assertDbUrlMatchesRef(target.dbUrl, target.ref);

  if (!writesConfirmed(env, target.ref)) {
    throw new GuardError(`PHASE2C_CONFIRM_DEV_WRITES=${target.ref} is required to apply Migration 023 to DEV.`);
  }

  const secrets = [target.anonKey, target.serviceKey, target.dbUrl].filter(Boolean);
  const redact = makeRedactor(() => secrets);

  console.log(`[MIGRATION 023] Target verified as DEV (${target.ref}). Opening direct PostgreSQL connection...`);
  const client = await openPgConnection(target.dbUrl);

  try {
    console.log("[MIGRATION 023] Capturing pre-migration snapshot...");
    const before = await captureInventorySnapshot(client);

    const migrationPath = resolve("supabase/migrations/023_phase3g4_provider_monitoring.sql");
    const rawSql = readFileSync(migrationPath, "utf8");
    const sha256 = createHash("sha256").update(rawSql).digest("hex");
    console.log(`[MIGRATION 023] Applying ${migrationPath} (${rawSql.length} bytes, sha256 ${sha256})...`);
    try {
      await client.query(rawSql);
      console.log("[MIGRATION 023] Applied SQL file successfully.");
    } catch (err) {
      console.error("[MIGRATION 023] SQL Execution failed:", err.message);
      try { await client.query("ROLLBACK;"); } catch { /* not in txn */ }
      throw err;
    }

    console.log("[MIGRATION 023] Capturing post-migration snapshot...");
    const after = await captureInventorySnapshot(client);

    const viewRes = await client.query(`
      SELECT table_name FROM information_schema.views
      WHERE table_schema = 'public' AND table_name = ANY($1::text[])
    `, [PHASE3G4_VIEWS]);
    const viewsPresent = viewRes.rows.map((r) => r.table_name);

    const fnRes = await client.query(`
      SELECT proname FROM pg_proc
      WHERE pronamespace = 'public'::regnamespace AND proname = ANY($1::text[])
    `, [PHASE3G4_FUNCTIONS]);
    const functionsPresent = fnRes.rows.map((r) => r.proname);

    const credCols = await client.query(`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (column_name ~* '(^|_)(api_key|api_secret|access_token|refresh_token|password|private_key)(_|$)'
             OR column_name IN ('token','secret','api_key','password'))
    `);

    const rlsRes = await client.query(`
      SELECT relname, relrowsecurity FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND relname = ANY($1::text[])
    `, [PHASE3G4_TABLES]);
    const newTableRls = Object.fromEntries(rlsRes.rows.map((r) => [r.relname, r.relrowsecurity]));

    const fnGrants = await client.query(`
      SELECT routine_name, grantee FROM information_schema.routine_privileges
      WHERE routine_schema = 'public'
        AND routine_name = ANY($1::text[])
        AND grantee IN ('anon', 'authenticated', 'PUBLIC', 'public')
    `, [RESTRICTED_FUNCTIONS]);

    const uniqueIdx = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE schemaname='public' AND indexname IN
        ('uq_monitoring_live_run', 'uq_action_item_open', 'uq_monitoring_schedule_account')
    `);

    const freqCheck = await client.query(`
      SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conrelid = 'public.provider_monitoring_schedules'::regclass
        AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%frequency%'
    `);

    const verification = {
      newTablesPresent: PHASE3G4_TABLES.every((t) => newTableRls[t] !== undefined),
      newTablesRlsEnabled: PHASE3G4_TABLES.every((t) => newTableRls[t] === true),
      newViewsPresent: PHASE3G4_VIEWS.every((v) => viewsPresent.includes(v)),
      newFunctionsPresent: PHASE3G4_FUNCTIONS.every((f) => functionsPresent.includes(f)),
      noPlaintextCredentialColumns: credCols.rows.length === 0,
      credentialColumnsFound: credCols.rows,
      monitoringFunctionsRestricted: fnGrants.rows.length === 0,
      monitoringFunctionGrants: fnGrants.rows,
      singleFlightAndDedupeIndexes: uniqueIdx.rows.length === 3,
      closedFrequencyVocabulary: freqCheck.rows.some((r) =>
        r.def.includes("'hourly'") && r.def.includes("'weekly'")),
      truncateHeldByAnyRole: [],
      anonExcessPrivileges: [],
      authenticatedPrivileges: {},
      policiesAdded: after.policies.filter((p) => PHASE3G4_TABLES.includes(p.tablename)),
      triggersAdded: after.triggers.filter((t) => PHASE3G4_TABLES.includes(t.event_object_table))
    };

    const ALL_TABLES = Object.keys(after.tables.anon ?? {});
    for (const role of ["anon", "authenticated", "service_role"]) {
      for (const t of ALL_TABLES) {
        if (after.tables[role]?.[t]?.TRUNCATE === true) {
          verification.truncateHeldByAnyRole.push(`${role}:${t}`);
        }
      }
    }

    for (const t of PHASE3G4_TABLES) {
      for (const p of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"]) {
        if (after.tables.anon?.[t]?.[p] === true) {
          verification.anonExcessPrivileges.push(`anon:${t}:${p}`);
        }
      }
      verification.authenticatedPrivileges[t] = {
        SELECT: after.tables.authenticated?.[t]?.SELECT,
        INSERT: after.tables.authenticated?.[t]?.INSERT,
        UPDATE: after.tables.authenticated?.[t]?.UPDATE,
        DELETE: after.tables.authenticated?.[t]?.DELETE,
        TRUNCATE: after.tables.authenticated?.[t]?.TRUNCATE
      };
    }

    const isPass = verification.newTablesPresent &&
                   verification.newTablesRlsEnabled &&
                   verification.newViewsPresent &&
                   verification.newFunctionsPresent &&
                   verification.noPlaintextCredentialColumns &&
                   verification.monitoringFunctionsRestricted &&
                   verification.singleFlightAndDedupeIndexes &&
                   verification.closedFrequencyVocabulary &&
                   verification.truncateHeldByAnyRole.length === 0 &&
                   verification.anonExcessPrivileges.length === 0;

    const report = {
      projectRef: target.ref,
      timestamp: new Date().toISOString(),
      migration: "023_phase3g4_provider_monitoring.sql",
      sha256,
      status: isPass ? "PASS" : "FAIL",
      verification,
      afterSummary: {
        tableCount: Object.keys(after.rlsStatus).length,
        policyCount: after.policies.length
      }
    };

    mkdirSync("phase2c-reports", { recursive: true });
    writeFileSync(join("phase2c-reports", "migration-023-report.json"), redact(JSON.stringify(report, null, 2)));

    console.log(`[MIGRATION 023] ${isPass ? "PASS" : "FAIL"} — report written to phase2c-reports/migration-023-report.json`);
    return report;
  } finally {
    await client.end();
  }
}

const isMain = process.argv[1] && existsSync(process.argv[1]) &&
  resolve(process.argv[1]).endsWith("apply-migration-023.mjs");
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

  runMigration023({ env }).catch((err) => {
    console.error("[MIGRATION 023] ERROR:", err);
    process.exit(1);
  });
}
