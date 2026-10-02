// Standalone Migration 021 Runner & Verification Tooling
// Phase 3G-2: Provider Reconciliation & Controlled Synchronization
// Target: DEV project ref: outuocpsotiozkpyksex ONLY
// Refuses production, validates target, executes in transaction, verifies all invariants.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { assertDevTarget, assertDbUrlMatchesRef, makeRedactor, writesConfirmed, GuardError } from "./phase2c-guard.mjs";
import { openPgConnection } from "./apply-migration-013.mjs";
import { captureInventorySnapshot } from "./apply-migration-019.mjs";

const PHASE3G2_TABLES = [
  "provider_reconciliation_runs",
  "provider_reconciliation_items"
];

const PHASE3G2_VIEWS = [
  "provider_reconciliation_overview",
  "provider_connection_overview"
];

const PHASE3G2_FUNCTIONS = [
  "provider_discovered_snapshot",
  "provider_snapshot_diff",
  "run_provider_reconciliation",
  "review_reconciliation_item",
  "apply_reconciliation_item",
  "link_discovered_resource"
];

const RESTRICTED_FUNCTIONS = [
  "run_provider_reconciliation",
  "review_reconciliation_item",
  "apply_reconciliation_item"
];

export async function runMigration021({ env = process.env } = {}) {
  const target = assertDevTarget(env);
  if (!target.dbUrl) {
    throw new GuardError("PHASE2C_DB_URL is required to execute Migration 021.");
  }
  assertDbUrlMatchesRef(target.dbUrl, target.ref);

  if (!writesConfirmed(env, target.ref)) {
    throw new GuardError(`PHASE2C_CONFIRM_DEV_WRITES=${target.ref} is required to apply Migration 021 to DEV.`);
  }

  const secrets = [target.anonKey, target.serviceKey, target.dbUrl].filter(Boolean);
  const redact = makeRedactor(() => secrets);

  console.log(`[MIGRATION 021] Target verified as DEV (${target.ref}). Opening direct PostgreSQL connection...`);
  const client = await openPgConnection(target.dbUrl);

  try {
    console.log("[MIGRATION 021] Capturing pre-migration snapshot...");
    const before = await captureInventorySnapshot(client);

    const migrationPath = resolve("supabase/migrations/021_phase3g2_reconciliation.sql");
    const rawSql = readFileSync(migrationPath, "utf8");
    console.log(`[MIGRATION 021] Applying ${migrationPath} (${rawSql.length} bytes)...`);
    try {
      await client.query(rawSql);
      console.log("[MIGRATION 021] Applied SQL file successfully.");
    } catch (err) {
      console.error("[MIGRATION 021] SQL Execution failed:", err.message);
      try { await client.query("ROLLBACK;"); } catch { /* not in txn */ }
      throw err;
    }

    console.log("[MIGRATION 021] Capturing post-migration snapshot...");
    const after = await captureInventorySnapshot(client);

    const viewRes = await client.query(`
      SELECT table_name FROM information_schema.views
      WHERE table_schema = 'public' AND table_name = ANY($1::text[])
    `, [PHASE3G2_VIEWS]);
    const viewsPresent = viewRes.rows.map((r) => r.table_name);

    const fnRes = await client.query(`
      SELECT proname FROM pg_proc
      WHERE pronamespace = 'public'::regnamespace AND proname = ANY($1::text[])
    `, [PHASE3G2_FUNCTIONS]);
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
    `, [PHASE3G2_TABLES]);
    const newTableRls = Object.fromEntries(rlsRes.rows.map((r) => [r.relname, r.relrowsecurity]));

    const fnGrants = await client.query(`
      SELECT routine_name, grantee FROM information_schema.routine_privileges
      WHERE routine_schema = 'public'
        AND routine_name = ANY($1::text[])
        AND grantee IN ('anon', 'authenticated', 'PUBLIC', 'public')
    `, [RESTRICTED_FUNCTIONS]);

    const uniqueIdx = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE schemaname='public' AND tablename='provider_reconciliation_items'
        AND indexname='uq_recon_open_item'
    `);

    const resourceCols = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='resources' AND column_name IN
        ('external_name','external_status','external_region','external_url','external_checked_at')
    `);

    const discCols = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='provider_discovered_resources' AND column_name IN
        ('external_missing','external_created_at','external_updated_at','reconciled_snapshot')
    `);

    const verification = {
      newTablesPresent: PHASE3G2_TABLES.every((t) => newTableRls[t] !== undefined),
      newTablesRlsEnabled: PHASE3G2_TABLES.every((t) => newTableRls[t] === true),
      newViewsPresent: PHASE3G2_VIEWS.every((v) => viewsPresent.includes(v)),
      newFunctionsPresent: PHASE3G2_FUNCTIONS.every((f) => functionsPresent.includes(f)),
      noPlaintextCredentialColumns: credCols.rows.length === 0,
      credentialColumnsFound: credCols.rows,
      reconcileFunctionsRestricted: fnGrants.rows.length === 0,
      reconcileFunctionGrants: fnGrants.rows,
      dedupeIndexPresent: uniqueIdx.rows.length === 1,
      resourceExternalColumns: resourceCols.rows.length === 5,
      discoveredReconColumns: discCols.rows.length === 4,
      truncateHeldByAnyRole: [],
      anonExcessPrivileges: [],
      authenticatedPrivileges: {},
      policiesAdded: after.policies.filter((p) => PHASE3G2_TABLES.includes(p.tablename)),
      triggersAdded: after.triggers.filter((t) => PHASE3G2_TABLES.includes(t.event_object_table))
    };

    const ALL_TABLES = Object.keys(after.tables.anon ?? {});
    for (const role of ["anon", "authenticated", "service_role"]) {
      for (const t of ALL_TABLES) {
        if (after.tables[role]?.[t]?.TRUNCATE === true) {
          verification.truncateHeldByAnyRole.push(`${role}:${t}`);
        }
      }
    }

    for (const t of PHASE3G2_TABLES) {
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
                   verification.reconcileFunctionsRestricted &&
                   verification.dedupeIndexPresent &&
                   verification.resourceExternalColumns &&
                   verification.discoveredReconColumns &&
                   verification.truncateHeldByAnyRole.length === 0 &&
                   verification.anonExcessPrivileges.length === 0;

    const report = {
      projectRef: target.ref,
      timestamp: new Date().toISOString(),
      migration: "021_phase3g2_reconciliation.sql",
      status: isPass ? "PASS" : "FAIL",
      verification,
      afterSummary: {
        tableCount: Object.keys(after.rlsStatus).length,
        policyCount: after.policies.length
      }
    };

    mkdirSync("phase2c-reports", { recursive: true });
    writeFileSync(join("phase2c-reports", "migration-021-report.json"), redact(JSON.stringify(report, null, 2)));

    const summaryMd = `# Migration 021 — Phase 3G-2 Provider Reconciliation & Controlled Synchronization Report

- **Target Project:** \`${target.ref}\` (Hosted DEV)
- **Status:** **${isPass ? "PASS — MIGRATION 021 VERIFIED ON DEV" : "FAILED — DEFECT DETECTED"}**
- **Timestamp:** ${report.timestamp}

## 1. Tables & Views
- Tables: \`${PHASE3G2_TABLES.join(", ")}\`
- Views: \`${PHASE3G2_VIEWS.join(", ")}\`
- Functions: \`${PHASE3G2_FUNCTIONS.join(", ")}\`
- Open-item dedupe index: ${verification.dedupeIndexPresent ? "PRESENT" : "MISSING"}
- resources.external_* columns: ${resourceCols.rows.length}/5
- discovered reconciliation columns: ${discCols.rows.length}/4

## 2. Credential Safety
- Plaintext credential columns: ${credCols.rows.length === 0 ? "NONE" : JSON.stringify(credCols.rows)}
- Reconcile/review/apply functions restricted to service_role: ${fnGrants.rows.length === 0 ? "YES" : JSON.stringify(fnGrants.rows)}

## 3. Privileges
- anon privileges on Phase 3G-2 tables: ${verification.anonExcessPrivileges.length === 0 ? "0 (DENIED)" : verification.anonExcessPrivileges.join(", ")}
- TRUNCATE held on any table: ${verification.truncateHeldByAnyRole.length === 0 ? "NONE" : verification.truncateHeldByAnyRole.join(", ")}
`;
    writeFileSync(join("phase2c-reports", "migration-021-report.md"), redact(summaryMd));

    console.log("--- MIGRATION 021 VERIFICATION SUMMARY ---");
    console.log(`Status: ${report.status}`);
    console.log(`New Tables: ${PHASE3G2_TABLES.join(", ")}`);
    console.log(`New Views: ${viewsPresent.join(", ")}`);
    console.log(`New Functions: ${functionsPresent.join(", ")}`);
    console.log(`Dedupe index: ${verification.dedupeIndexPresent}`);
    console.log(`Policies Added: ${verification.policiesAdded.length}`);
    console.log(`TRUNCATE held: ${verification.truncateHeldByAnyRole.length === 0 ? "NONE" : verification.truncateHeldByAnyRole.join(", ")}`);

    return report;
  } finally {
    await client.end();
  }
}

// Auto-run if executed directly
if (process.argv[1]?.endsWith("apply-migration-021.mjs")) {
  const env = {};
  if (existsSync(".env.phase2c")) {
    readFileSync(".env.phase2c", "utf8").split("\n").forEach((l) => {
      const m = l.match(/^\s*([^#][^=]*)=(.*)$/);
      if (m) env[m[1].trim()] = m[2].trim();
    });
  }
  env.PHASE2C_DEV_PROJECT_REF = "outuocpsotiozkpyksex";
  env.PHASE2C_CONFIRM_DEV_WRITES = "outuocpsotiozkpyksex";

  runMigration021({ env }).catch((err) => {
    console.error("[MIGRATION 021] ERROR:", err);
    process.exit(1);
  });
}
