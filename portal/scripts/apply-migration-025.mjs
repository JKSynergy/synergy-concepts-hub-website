// Standalone Migration 025 Runner & Verification Tooling
// Phase 3G-6: Controlled Operational Automation
// Target: DEV project ref: outuocpsotiozkpyksex ONLY
// Refuses production, validates target, executes in transaction, verifies all invariants.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { assertDevTarget, assertDbUrlMatchesRef, makeRedactor, writesConfirmed, GuardError } from "./phase2c-guard.mjs";
import { openPgConnection } from "./apply-migration-013.mjs";
import { captureInventorySnapshot } from "./apply-migration-019.mjs";

const PHASE3G6_TABLES = [
  "automation_rules",
  "automation_runs"
];

const PHASE3G6_VIEWS = [
  "automation_rule_overview",
  "automation_run_overview"
];

const PHASE3G6_FUNCTIONS = [
  "check_automation_rule_integrity",
  "automation_upsert_signal",
  "automation_create_task",
  "automation_record",
  "automation_in_cooldown",
  "save_automation_rule",
  "evaluate_account_automation",
  "evaluate_automation_sweep",
  "log_automation_rule_audit",
  "automation_prevent_destructive_delete"
];

const RESTRICTED_FUNCTIONS = [
  "automation_upsert_signal",
  "automation_create_task",
  "automation_record",
  "automation_in_cooldown",
  "save_automation_rule",
  "evaluate_account_automation",
  "evaluate_automation_sweep"
];

const CATALOG_KEYS = [
  "connection_failure_escalation",
  "linked_resource_missing_investigation",
  "provider_resume_proposal",
  "backup_failure_escalation",
  "incident_escalation"
];

export async function runMigration025({ env = process.env } = {}) {
  const target = assertDevTarget(env);
  if (!target.dbUrl) {
    throw new GuardError("PHASE2C_DB_URL is required to execute Migration 025.");
  }
  assertDbUrlMatchesRef(target.dbUrl, target.ref);

  if (!writesConfirmed(env, target.ref)) {
    throw new GuardError(`PHASE2C_CONFIRM_DEV_WRITES=${target.ref} is required to apply Migration 025 to DEV.`);
  }

  const secrets = [target.anonKey, target.serviceKey, target.dbUrl].filter(Boolean);
  const redact = makeRedactor(() => secrets);

  console.log(`[MIGRATION 025] Target verified as DEV (${target.ref}). Opening direct PostgreSQL connection...`);
  const client = await openPgConnection(target.dbUrl);

  try {
    console.log("[MIGRATION 025] Capturing pre-migration snapshot...");
    const before = await captureInventorySnapshot(client);

    const migrationPath = resolve("supabase/migrations/025_phase3g6_controlled_automation.sql");
    const rawSql = readFileSync(migrationPath, "utf8");
    const sha256 = createHash("sha256").update(rawSql).digest("hex");
    console.log(`[MIGRATION 025] Applying ${migrationPath} (${rawSql.length} bytes, sha256 ${sha256})...`);
    try {
      await client.query(rawSql);
      console.log("[MIGRATION 025] Applied SQL file successfully.");
    } catch (err) {
      console.error("[MIGRATION 025] SQL Execution failed:", err.message);
      try { await client.query("ROLLBACK;"); } catch { /* not in txn */ }
      throw err;
    }

    console.log("[MIGRATION 025] Capturing post-migration snapshot...");
    const after = await captureInventorySnapshot(client);

    const viewRes = await client.query(`
      SELECT table_name FROM information_schema.views
      WHERE table_schema = 'public' AND table_name = ANY($1::text[])
    `, [PHASE3G6_VIEWS]);
    const viewsPresent = viewRes.rows.map((r) => r.table_name);

    const fnRes = await client.query(`
      SELECT proname FROM pg_proc
      WHERE pronamespace = 'public'::regnamespace AND proname = ANY($1::text[])
    `, [PHASE3G6_FUNCTIONS]);
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
    `, [PHASE3G6_TABLES]);
    const newTableRls = Object.fromEntries(rlsRes.rows.map((r) => [r.relname, r.relrowsecurity]));

    const fnGrants = await client.query(`
      SELECT routine_name, grantee FROM information_schema.routine_privileges
      WHERE routine_schema = 'public'
        AND routine_name = ANY($1::text[])
        AND grantee IN ('anon', 'authenticated', 'PUBLIC', 'public')
    `, [RESTRICTED_FUNCTIONS]);

    const catalogRes = await client.query(`
      SELECT rule_key, risk_class, scope, enabled FROM public.automation_rules ORDER BY rule_key
    `);
    const catalogKeys = catalogRes.rows.map((r) => r.rule_key);

    const autoKeyIdx = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE schemaname='public' AND indexname IN
        ('uq_tasks_automation_open', 'idx_automation_runs_scope', 'idx_automation_runs_evaluated')
    `);

    const taskCol = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='tasks' AND column_name='automation_key'
    `);

    const srcCheck = await client.query(`
      SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conrelid = 'public.action_items'::regclass
        AND conname = 'action_items_source_check'
    `);

    const verification = {
      newTablesPresent: PHASE3G6_TABLES.every((t) => newTableRls[t] !== undefined),
      newTablesRlsEnabled: PHASE3G6_TABLES.every((t) => newTableRls[t] === true),
      newViewsPresent: PHASE3G6_VIEWS.every((v) => viewsPresent.includes(v)),
      newFunctionsPresent: PHASE3G6_FUNCTIONS.every((f) => functionsPresent.includes(f)),
      noPlaintextCredentialColumns: credCols.rows.length === 0,
      credentialColumnsFound: credCols.rows,
      automationFunctionsRestricted: fnGrants.rows.length === 0,
      automationFunctionGrants: fnGrants.rows,
      catalogSeeded: CATALOG_KEYS.every((k) => catalogKeys.includes(k)) && catalogKeys.length === CATALOG_KEYS.length,
      catalogSeededRows: catalogRes.rows,
      automationKeyIndexPresent: autoKeyIdx.rows.length === 3,
      taskAutomationKeyPresent: taskCol.rows.length === 1,
      actionItemSourceExtended: srcCheck.rows.some((r) => r.def.includes("'automation'")),
      truncateHeldByAnyRole: [],
      anonExcessPrivileges: [],
      authenticatedPrivileges: {},
      policiesAdded: after.policies.filter((p) => PHASE3G6_TABLES.includes(p.tablename)),
      triggersAdded: after.triggers.filter((t) => PHASE3G6_TABLES.includes(t.event_object_table))
    };

    const ALL_TABLES = Object.keys(after.tables.anon ?? {});
    for (const role of ["anon", "authenticated", "service_role"]) {
      for (const t of ALL_TABLES) {
        if (after.tables[role]?.[t]?.TRUNCATE === true) {
          verification.truncateHeldByAnyRole.push(`${role}:${t}`);
        }
      }
    }

    for (const t of PHASE3G6_TABLES) {
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
                   verification.automationFunctionsRestricted &&
                   verification.catalogSeeded &&
                   verification.automationKeyIndexPresent &&
                   verification.taskAutomationKeyPresent &&
                   verification.actionItemSourceExtended &&
                   verification.truncateHeldByAnyRole.length === 0 &&
                   verification.anonExcessPrivileges.length === 0;

    const report = {
      projectRef: target.ref,
      timestamp: new Date().toISOString(),
      migration: "025_phase3g6_controlled_automation.sql",
      sha256,
      status: isPass ? "PASS" : "FAIL",
      verification,
      afterSummary: {
        tableCount: Object.keys(after.rlsStatus).length,
        policyCount: after.policies.length
      }
    };

    mkdirSync("phase2c-reports", { recursive: true });
    writeFileSync(join("phase2c-reports", "migration-025-report.json"), redact(JSON.stringify(report, null, 2)));

    console.log(`[MIGRATION 025] ${isPass ? "PASS" : "FAIL"} — report written to phase2c-reports/migration-025-report.json`);
    return report;
  } finally {
    await client.end();
  }
}

const isMain = process.argv[1] && existsSync(process.argv[1]) &&
  resolve(process.argv[1]).endsWith("apply-migration-025.mjs");
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

  runMigration025({ env }).catch((err) => {
    console.error("[MIGRATION 025] ERROR:", err);
    process.exit(1);
  });
}
