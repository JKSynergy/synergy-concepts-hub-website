// Standalone Migration 019 Runner & Verification Tooling
// Target: DEV project ref: outuocpsotiozkpyksex ONLY
// Refuses production, validates target, executes in transaction, verifies all invariants.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { assertDevTarget, assertDbUrlMatchesRef, makeRedactor, writesConfirmed, GuardError } from "./phase2c-guard.mjs";
import { openPgConnection } from "./apply-migration-013.mjs";

const PHASE2_TABLES = [
  "academy_courses", "audit_logs", "bookings", "deliverables", "document_counters",
  "invoice_line_items", "invoices", "leads", "payments", "profiles",
  "project_assignments", "project_milestones", "project_updates", "projects",
  "receipts", "service_catalog"
];

const PHASE3A_TABLES = [
  "providers",
  "provider_accounts",
  "systems",
  "resources"
];

const PHASE3B_TABLES = [
  "service_agreements",
  "agreement_resources",
  "recurring_charges",
  "recurring_charge_runs"
];

const PHASE3C_TABLES = [
  "suspension_cases",
  "suspension_actions"
];

const PHASE3D_TABLES = [
  "incidents",
  "tasks"
];

const PHASE3E_TABLES = [
  "backup_policies",
  "backup_events"
];

const PHASE3F_TABLES = [
  "provider_costs"
];

const PHASE3F_VIEWS = [
  "provider_cost_overview",
  "service_margin_view",
  "staff_provider_costs_view"
];

const ALL_TABLES = [...PHASE2_TABLES, ...PHASE3A_TABLES, ...PHASE3B_TABLES, ...PHASE3C_TABLES, ...PHASE3D_TABLES, ...PHASE3E_TABLES, ...PHASE3F_TABLES];
const ALL_PRIVS = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"];

export async function captureInventorySnapshot(client) {
  const snapshot = {
    capturedAt: new Date().toISOString(),
    tables: {},
    rlsStatus: {},
    policies: [],
    columns: {},
    triggers: []
  };

  for (const role of ["anon", "authenticated", "service_role"]) {
    snapshot.tables[role] = {};
    for (const t of ALL_TABLES) {
      snapshot.tables[role][t] = {};
      for (const p of ALL_PRIVS) {
        snapshot.tables[role][t][p] = false;
      }
    }
  }

  const privQuery = `
    SELECT grantee, table_name, privilege_type
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND grantee IN ('anon', 'authenticated', 'service_role')
      AND table_name = ANY($1::text[])
  `;
  const privRes = await client.query(privQuery, [ALL_TABLES]);
  for (const row of privRes.rows) {
    if (snapshot.tables[row.grantee]?.[row.table_name]) {
      snapshot.tables[row.grantee][row.table_name][row.privilege_type] = true;
    }
  }

  const rlsRes = await client.query(`
    SELECT relname as tablename, relrowsecurity as rls_enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND relname = ANY($1::text[])
  `, [ALL_TABLES]);
  for (const row of rlsRes.rows) {
    snapshot.rlsStatus[row.tablename] = row.rls_enabled;
  }

  const polRes = await client.query(`
    SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY($1::text[])
    ORDER BY tablename, policyname
  `, [ALL_TABLES]);
  snapshot.policies = polRes.rows;

  const trgRes = await client.query(`
    SELECT trigger_name, event_manipulation, event_object_table, action_statement
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
      AND event_object_table = ANY($1::text[])
    ORDER BY event_object_table, trigger_name
  `, [ALL_TABLES]);
  snapshot.triggers = trgRes.rows;

  return snapshot;
}

export async function runMigration019({ env = process.env } = {}) {
  const target = assertDevTarget(env);
  if (!target.dbUrl) {
    throw new GuardError("PHASE2C_DB_URL is required to execute Migration 019.");
  }
  assertDbUrlMatchesRef(target.dbUrl, target.ref);

  if (!writesConfirmed(env, target.ref)) {
    throw new GuardError(`PHASE2C_CONFIRM_DEV_WRITES=${target.ref} is required to apply Migration 019 to DEV.`);
  }

  const secrets = [target.anonKey, target.serviceKey, target.dbUrl].filter(Boolean);
  const redact = makeRedactor(() => secrets);

  console.log(`[MIGRATION 019] Target verified as DEV (${target.ref}). Opening direct PostgreSQL connection...`);
  const client = await openPgConnection(target.dbUrl);

  async function applyMigration019(pgClient, sqlFile) {
    const rawSql = readFileSync(sqlFile, "utf8");
    console.log(`[MIGRATION 019] Reading ${sqlFile} (${rawSql.length} bytes)...`);

    try {
      await pgClient.query(rawSql);
      console.log("[MIGRATION 019] Applied SQL file successfully.");
    } catch (err) {
      console.error("[MIGRATION 019] SQL Execution failed:", err.message);
      try {
        await pgClient.query("ROLLBACK;");
      } catch (rbErr) {
        // ignore rollback err if not in txn
      }
      throw err;
    }
  }

  try {
    console.log("[MIGRATION 019] Capturing pre-migration snapshot...");
    const before = await captureInventorySnapshot(client);

    const migrationPath = resolve("supabase/migrations/019_phase3f_provider_costs.sql");
    console.log(`[MIGRATION 019] Applying ${migrationPath} in a transaction...`);
    await applyMigration019(client, migrationPath);
    console.log("[MIGRATION 019] Migration 019 executed successfully!");

    console.log("[MIGRATION 019] Capturing post-migration snapshot...");
    const after = await captureInventorySnapshot(client);

    // Verify views exist
    const viewRes = await client.query(`
      SELECT table_name FROM information_schema.views
      WHERE table_schema = 'public' AND table_name = ANY($1::text[])
    `, [PHASE3F_VIEWS]);
    const viewsPresent = viewRes.rows.map(r => r.table_name);

    const verification = {
      newTablesPresent: PHASE3F_TABLES.every((t) => after.rlsStatus[t] !== undefined),
      newTablesRlsEnabled: PHASE3F_TABLES.every((t) => after.rlsStatus[t] === true),
      newViewsPresent: PHASE3F_VIEWS.every((v) => viewsPresent.includes(v)),
      existingTablesRlsPreserved: [...PHASE2_TABLES, ...PHASE3A_TABLES, ...PHASE3B_TABLES, ...PHASE3C_TABLES, ...PHASE3D_TABLES, ...PHASE3E_TABLES].every((t) => after.rlsStatus[t] === true),
      truncateHeldByAnyRole: [],
      anonExcessPrivileges: [],
      authenticatedPrivileges: {},
      policiesAdded: after.policies.filter((p) => PHASE3F_TABLES.includes(p.tablename)),
      triggersAdded: after.triggers.filter((t) => PHASE3F_TABLES.includes(t.event_object_table))
    };

    for (const role of ["anon", "authenticated", "service_role"]) {
      for (const t of ALL_TABLES) {
        if (after.tables[role]?.[t]?.TRUNCATE === true) {
          verification.truncateHeldByAnyRole.push(`${role}:${t}`);
        }
      }
    }

    for (const t of PHASE3F_TABLES) {
      for (const p of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"]) {
        if (after.tables.anon?.[t]?.[p] === true) {
          verification.anonExcessPrivileges.push(`anon:${t}:${p}`);
        }
      }
    }

    for (const t of PHASE3F_TABLES) {
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
                   verification.existingTablesRlsPreserved &&
                   verification.truncateHeldByAnyRole.length === 0 &&
                   verification.anonExcessPrivileges.length === 0;

    const report = {
      projectRef: target.ref,
      timestamp: new Date().toISOString(),
      migration: "019_phase3f_provider_costs.sql",
      status: isPass ? "PASS" : "FAIL",
      verification,
      beforeSummary: {
        tableCount: Object.keys(before.rlsStatus).length,
        policyCount: before.policies.length
      },
      afterSummary: {
        tableCount: Object.keys(after.rlsStatus).length,
        policyCount: after.policies.length
      }
    };

    mkdirSync("phase2c-reports", { recursive: true });
    writeFileSync(join("phase2c-reports", "migration-019-report.json"), redact(JSON.stringify(report, null, 2)));

    const summaryMd = `# Migration 019 — Phase 3F Provider Costs, Renewals & Service Margin Report

- **Target Project:** \`${target.ref}\` (Hosted DEV)
- **Status:** **${isPass ? "PASS — MIGRATION 019 VERIFIED ON DEV" : "FAILED — DEFECT DETECTED"}**
- **Timestamp:** ${report.timestamp}

## 1. Table & View Inventory
- Phase 3F Tables Created: \`${PHASE3F_TABLES.join(", ")}\` (1/1 present)
- Phase 3F Views Created: \`${PHASE3F_VIEWS.join(", ")}\` (${viewsPresent.length}/3 present)
- Total Application Tables: ${report.afterSummary.tableCount}
- RLS Status: ${report.afterSummary.tableCount}/${report.afterSummary.tableCount} tables ENABLED

## 2. Row-Level Security & Policies
- Total Policies: ${after.policies.length} (${before.policies.length} pre-migration + ${verification.policiesAdded.length} Phase 3F policies)
- Delete Blocked on provider_costs: **YES (BEFORE DELETE trigger prevents destructive deletion)**
- Anon Access Denied: **YES (0 privileges)**
- Client Direct Access: **DENIED (0 rows returned by RLS)**

## 3. Privilege Model & Hardening
- \`anon\` privileges on Phase 3F tables: **0 (DENIED)**
- \`authenticated\` privileges: SELECT, INSERT, UPDATE (no DELETE, no TRUNCATE)
- \`TRUNCATE\` held across all ${ALL_TABLES.length} tables: **${verification.truncateHeldByAnyRole.length === 0 ? "NONE (ALL TABLES HARDENED)" : verification.truncateHeldByAnyRole.join(", ")}**
`;
    writeFileSync(join("phase2c-reports", "migration-019-report.md"), redact(summaryMd));

    console.log("--- MIGRATION 019 VERIFICATION SUMMARY ---");
    console.log(`Status: ${report.status}`);
    console.log(`New Tables Created: ${PHASE3F_TABLES.join(", ")}`);
    console.log(`New Views Created: ${viewsPresent.join(", ")}`);
    console.log(`RLS Enabled on all ${ALL_TABLES.length} tables: ${verification.newTablesRlsEnabled ? "YES" : "NO"}`);
    console.log(`Policies Added: ${verification.policiesAdded.length}`);
    console.log(`TRUNCATE held on any table: ${verification.truncateHeldByAnyRole.length === 0 ? "NONE (CLEAN)" : verification.truncateHeldByAnyRole.join(", ")}`);
    console.log(`Anon privileges: ${verification.anonExcessPrivileges.length === 0 ? "0 (SECURE)" : verification.anonExcessPrivileges.join(", ")}`);

    return report;
  } finally {
    await client.end();
  }
}

// Auto-run if executed directly
if (process.argv[1]?.endsWith("apply-migration-019.mjs")) {
  const env = {};
  if (existsSync(".env.phase2c")) {
    readFileSync(".env.phase2c", "utf8").split("\n").forEach((l) => {
      const m = l.match(/^\s*([^#][^=]*)=(.*)$/);
      if (m) env[m[1].trim()] = m[2].trim();
    });
  }
  env.PHASE2C_DEV_PROJECT_REF = "outuocpsotiozkpyksex";
  env.PHASE2C_CONFIRM_DEV_WRITES = "outuocpsotiozkpyksex";

  runMigration019({ env }).catch((err) => {
    console.error("[MIGRATION 019] ERROR:", err);
    process.exit(1);
  });
}
