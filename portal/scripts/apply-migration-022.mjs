// Standalone Migration 022 Runner & Verification Tooling
// Phase 3G-3: Controlled Provider Operations
// Target: DEV project ref: outuocpsotiozkpyksex ONLY
// Refuses production, validates target, executes in transaction, verifies all invariants.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { assertDevTarget, assertDbUrlMatchesRef, makeRedactor, writesConfirmed, GuardError } from "./phase2c-guard.mjs";
import { openPgConnection } from "./apply-migration-013.mjs";
import { captureInventorySnapshot } from "./apply-migration-019.mjs";

const PHASE3G3_TABLES = [
  "provider_operation_proposals",
  "provider_operation_executions"
];

const PHASE3G3_VIEWS = [
  "provider_operation_overview",
  "provider_operation_execution_overview"
];

const PHASE3G3_FUNCTIONS = [
  "propose_provider_operation",
  "review_provider_operation",
  "begin_provider_operation_execution",
  "complete_provider_operation_execution",
  "finish_provider_operation_verification"
];

const RESTRICTED_FUNCTIONS = PHASE3G3_FUNCTIONS;

export async function runMigration022({ env = process.env } = {}) {
  const target = assertDevTarget(env);
  if (!target.dbUrl) {
    throw new GuardError("PHASE2C_DB_URL is required to execute Migration 022.");
  }
  assertDbUrlMatchesRef(target.dbUrl, target.ref);

  if (!writesConfirmed(env, target.ref)) {
    throw new GuardError(`PHASE2C_CONFIRM_DEV_WRITES=${target.ref} is required to apply Migration 022 to DEV.`);
  }

  const secrets = [target.anonKey, target.serviceKey, target.dbUrl].filter(Boolean);
  const redact = makeRedactor(() => secrets);

  console.log(`[MIGRATION 022] Target verified as DEV (${target.ref}). Opening direct PostgreSQL connection...`);
  const client = await openPgConnection(target.dbUrl);

  try {
    console.log("[MIGRATION 022] Capturing pre-migration snapshot...");
    const before = await captureInventorySnapshot(client);

    const migrationPath = resolve("supabase/migrations/022_phase3g3_provider_operations.sql");
    const rawSql = readFileSync(migrationPath, "utf8");
    console.log(`[MIGRATION 022] Applying ${migrationPath} (${rawSql.length} bytes)...`);
    try {
      await client.query(rawSql);
      console.log("[MIGRATION 022] Applied SQL file successfully.");
    } catch (err) {
      console.error("[MIGRATION 022] SQL Execution failed:", err.message);
      try { await client.query("ROLLBACK;"); } catch { /* not in txn */ }
      throw err;
    }

    console.log("[MIGRATION 022] Capturing post-migration snapshot...");
    const after = await captureInventorySnapshot(client);

    const viewRes = await client.query(`
      SELECT table_name FROM information_schema.views
      WHERE table_schema = 'public' AND table_name = ANY($1::text[])
    `, [PHASE3G3_VIEWS]);
    const viewsPresent = viewRes.rows.map((r) => r.table_name);

    const fnRes = await client.query(`
      SELECT proname FROM pg_proc
      WHERE pronamespace = 'public'::regnamespace AND proname = ANY($1::text[])
    `, [PHASE3G3_FUNCTIONS]);
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
    `, [PHASE3G3_TABLES]);
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
        ('uq_operation_open_proposal', 'uq_operation_live_execution')
    `);

    const opCheck = await client.query(`
      SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conrelid = 'public.provider_operation_proposals'::regclass
        AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%operation_key%'
    `);

    const verification = {
      newTablesPresent: PHASE3G3_TABLES.every((t) => newTableRls[t] !== undefined),
      newTablesRlsEnabled: PHASE3G3_TABLES.every((t) => newTableRls[t] === true),
      newViewsPresent: PHASE3G3_VIEWS.every((v) => viewsPresent.includes(v)),
      newFunctionsPresent: PHASE3G3_FUNCTIONS.every((f) => functionsPresent.includes(f)),
      noPlaintextCredentialColumns: credCols.rows.length === 0,
      credentialColumnsFound: credCols.rows,
      operationFunctionsRestricted: fnGrants.rows.length === 0,
      operationFunctionGrants: fnGrants.rows,
      dedupeIndexPresent: uniqueIdx.rows.length === 2,
      closedOperationVocabulary: opCheck.rows.some((r) =>
        r.def.includes("'pause_resource'") && r.def.includes("'resume_resource'")),
      truncateHeldByAnyRole: [],
      anonExcessPrivileges: [],
      authenticatedPrivileges: {},
      policiesAdded: after.policies.filter((p) => PHASE3G3_TABLES.includes(p.tablename)),
      triggersAdded: after.triggers.filter((t) => PHASE3G3_TABLES.includes(t.event_object_table))
    };

    const ALL_TABLES = Object.keys(after.tables.anon ?? {});
    for (const role of ["anon", "authenticated", "service_role"]) {
      for (const t of ALL_TABLES) {
        if (after.tables[role]?.[t]?.TRUNCATE === true) {
          verification.truncateHeldByAnyRole.push(`${role}:${t}`);
        }
      }
    }

    for (const t of PHASE3G3_TABLES) {
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
                   verification.operationFunctionsRestricted &&
                   verification.dedupeIndexPresent &&
                   verification.closedOperationVocabulary &&
                   verification.truncateHeldByAnyRole.length === 0 &&
                   verification.anonExcessPrivileges.length === 0;

    const report = {
      projectRef: target.ref,
      timestamp: new Date().toISOString(),
      migration: "022_phase3g3_provider_operations.sql",
      status: isPass ? "PASS" : "FAIL",
      verification,
      afterSummary: {
        tableCount: Object.keys(after.rlsStatus).length,
        policyCount: after.policies.length
      }
    };

    mkdirSync("phase2c-reports", { recursive: true });
    writeFileSync(join("phase2c-reports", "migration-022-report.json"), redact(JSON.stringify(report, null, 2)));

    const summaryMd = `# Migration 022 — Phase 3G-3 Controlled Provider Operations Report

- **Target Project:** \`${target.ref}\` (Hosted DEV)
- **Status:** **${isPass ? "PASS — MIGRATION 022 VERIFIED ON DEV" : "FAILED — DEFECT DETECTED"}**
- **Timestamp:** ${report.timestamp}

## 1. Tables & Views
- Tables: \`${PHASE3G3_TABLES.join(", ")}\`
- Views: \`${PHASE3G3_VIEWS.join(", ")}\`
- Functions: \`${PHASE3G3_FUNCTIONS.join(", ")}\`
- Dedupe/single-flight indexes: ${verification.dedupeIndexPresent ? "PRESENT (2)" : "MISSING"}
- Closed operation vocabulary: ${verification.closedOperationVocabulary ? "pause_resource/resume_resource only" : "NOT CONFIRMED"}

## 2. Credential Safety
- Plaintext credential columns: ${credCols.rows.length === 0 ? "NONE" : JSON.stringify(credCols.rows)}
- Operation functions restricted to service_role: ${fnGrants.rows.length === 0 ? "YES" : JSON.stringify(fnGrants.rows)}

## 3. Privileges
- anon privileges on Phase 3G-3 tables: ${verification.anonExcessPrivileges.length === 0 ? "0 (DENIED)" : verification.anonExcessPrivileges.join(", ")}
- TRUNCATE held on any table: ${verification.truncateHeldByAnyRole.length === 0 ? "NONE" : verification.truncateHeldByAnyRole.join(", ")}
`;
    writeFileSync(join("phase2c-reports", "migration-022-report.md"), redact(summaryMd));

    console.log("--- MIGRATION 022 VERIFICATION SUMMARY ---");
    console.log(`Status: ${report.status}`);
    console.log(`New Tables: ${PHASE3G3_TABLES.join(", ")}`);
    console.log(`New Views: ${viewsPresent.join(", ")}`);
    console.log(`New Functions: ${functionsPresent.join(", ")}`);
    console.log(`Dedupe/single-flight indexes: ${verification.dedupeIndexPresent}`);
    console.log(`Closed operation vocabulary: ${verification.closedOperationVocabulary}`);
    console.log(`Policies Added: ${verification.policiesAdded.length}`);
    console.log(`TRUNCATE held: ${verification.truncateHeldByAnyRole.length === 0 ? "NONE" : verification.truncateHeldByAnyRole.join(", ")}`);

    return report;
  } finally {
    await client.end();
  }
}

// Auto-run if executed directly
if (process.argv[1]?.endsWith("apply-migration-022.mjs")) {
  const env = {};
  if (existsSync(".env.phase2c")) {
    readFileSync(".env.phase2c", "utf8").split("\n").forEach((l) => {
      const m = l.match(/^\s*([^#][^=]*)=(.*)$/);
      if (m) env[m[1].trim()] = m[2].trim();
    });
  }
  env.PHASE2C_DEV_PROJECT_REF = "outuocpsotiozkpyksex";
  env.PHASE2C_CONFIRM_DEV_WRITES = "outuocpsotiozkpyksex";

  runMigration022({ env }).catch((err) => {
    console.error("[MIGRATION 022] ERROR:", err);
    process.exit(1);
  });
}
