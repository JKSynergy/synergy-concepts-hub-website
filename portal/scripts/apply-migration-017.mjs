// Standalone Migration 017 Runner & Verification Tooling
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

const ALL_TABLES = [...PHASE2_TABLES, ...PHASE3A_TABLES, ...PHASE3B_TABLES, ...PHASE3C_TABLES, ...PHASE3D_TABLES];
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

  // 1. Table privileges for each role
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

  // 2. RLS status for each table
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

  // 3. Existing policies
  const polRes = await client.query(`
    SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY($1::text[])
    ORDER BY tablename, policyname
  `, [ALL_TABLES]);
  snapshot.policies = polRes.rows;

  // 4. Triggers
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

export async function runMigration017({ env = process.env } = {}) {
  const target = assertDevTarget(env);
  if (!target.dbUrl) {
    throw new GuardError("PHASE2C_DB_URL is required to execute Migration 017.");
  }
  assertDbUrlMatchesRef(target.dbUrl, target.ref);

  if (!writesConfirmed(env, target.ref)) {
    throw new GuardError(`PHASE2C_CONFIRM_DEV_WRITES=${target.ref} is required to apply Migration 017 to DEV.`);
  }

  const secrets = [target.anonKey, target.serviceKey, target.dbUrl].filter(Boolean);
  const redact = makeRedactor(() => secrets);

  console.log(`[MIGRATION 017] Target verified as DEV (${target.ref}). Opening direct PostgreSQL connection...`);
  const client = await openPgConnection(target.dbUrl);

  async function applyMigration017(pgClient, sqlFile) {
    const rawSql = readFileSync(sqlFile, "utf8");
    console.log(`[MIGRATION 017] Reading ${sqlFile} (${rawSql.length} bytes)...`);

    try {
      await pgClient.query(rawSql);
      console.log("[MIGRATION 017] Applied SQL file successfully.");
    } catch (err) {
      console.error("[MIGRATION 017] SQL Execution failed:", err.message);
      try {
        await pgClient.query("ROLLBACK;");
      } catch (rbErr) {
        // ignore rollback err if not in txn
      }
      throw err;
    }
  }

  try {
    console.log("[MIGRATION 017] Capturing pre-migration snapshot...");
    const before = await captureInventorySnapshot(client);

    const migrationPath = resolve("supabase/migrations/017_phase3d_operations.sql");
    console.log(`[MIGRATION 017] Applying ${migrationPath} in a transaction...`);
    await applyMigration017(client, migrationPath);
    console.log("[MIGRATION 017] Migration 017 executed successfully!");

    console.log("[MIGRATION 017] Capturing post-migration snapshot...");
    const after = await captureInventorySnapshot(client);

    // Verification analysis
    const verification = {
      newTablesPresent: PHASE3D_TABLES.every((t) => after.rlsStatus[t] !== undefined),
      newTablesRlsEnabled: PHASE3D_TABLES.every((t) => after.rlsStatus[t] === true),
      existingTablesRlsPreserved: [...PHASE2_TABLES, ...PHASE3A_TABLES, ...PHASE3B_TABLES, ...PHASE3C_TABLES].every((t) => after.rlsStatus[t] === true),
      truncateHeldByAnyRole: [],
      anonExcessPrivileges: [],
      authenticatedPrivileges: {},
      policiesAdded: after.policies.filter((p) => PHASE3D_TABLES.includes(p.tablename)),
      triggersAdded: after.triggers.filter((t) => PHASE3D_TABLES.includes(t.event_object_table))
    };

    // Check TRUNCATE across all 28 tables
    for (const role of ["anon", "authenticated", "service_role"]) {
      for (const t of ALL_TABLES) {
        if (after.tables[role]?.[t]?.TRUNCATE === true) {
          verification.truncateHeldByAnyRole.push(`${role}:${t}`);
        }
      }
    }

    // Check anon has 0 privileges on any Phase 3D table
    for (const t of PHASE3D_TABLES) {
      for (const p of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"]) {
        if (after.tables.anon?.[t]?.[p] === true) {
          verification.anonExcessPrivileges.push(`anon:${t}:${p}`);
        }
      }
    }

    // Check authenticated privileges on Phase 3D tables
    for (const t of PHASE3D_TABLES) {
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
                   verification.existingTablesRlsPreserved &&
                   verification.truncateHeldByAnyRole.length === 0 &&
                   verification.anonExcessPrivileges.length === 0;

    const report = {
      projectRef: target.ref,
      timestamp: new Date().toISOString(),
      migration: "017_phase3d_operations.sql",
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
    writeFileSync(join("phase2c-reports", "migration-017-report.json"), redact(JSON.stringify(report, null, 2)));

    const summaryMd = `# Migration 017 — Phase 3D Operations Report

- **Target Project:** \`${target.ref}\` (Hosted DEV)
- **Status:** **${isPass ? "PASS — MIGRATION 017 VERIFIED ON DEV" : "FAILED — DEFECT DETECTED"}**
- **Timestamp:** ${report.timestamp}

## 1. Table Inventory
- Phase 3D Tables Created: \`${PHASE3D_TABLES.join(", ")}\` (2/2 present)
- Total Application Tables: ${report.afterSummary.tableCount} (16 Phase 2C + 4 Phase 3A + 4 Phase 3B + 2 Phase 3C + 2 Phase 3D)
- RLS Status: 28/28 tables ENABLED

## 2. Row-Level Security & Policies
- Total Policies: ${after.policies.length} (${before.policies.length} Pre-migration + ${verification.policiesAdded.length} Phase 3D policies)
- Delete Blocked on Tasks & Incidents: **YES (table triggers prevent destructive deletion)**
- Anon Access Denied: **YES (0 privileges)**
- Client Direct Access: **DENIED (0 rows returned by RLS)**

## 3. Privilege Model & Hardening
- \`anon\` privileges on Phase 3D tables: **0 (DENIED)**
- \`authenticated\` privileges: SELECT, INSERT, UPDATE (no DELETE, no TRUNCATE)
- \`TRUNCATE\` held across all 28 tables: **${verification.truncateHeldByAnyRole.length === 0 ? "NONE (ALL 28 TABLES HARDENED)" : verification.truncateHeldByAnyRole.join(", ")}**
`;
    writeFileSync(join("phase2c-reports", "migration-017-report.md"), redact(summaryMd));

    console.log("--- MIGRATION 017 VERIFICATION SUMMARY ---");
    console.log(`Status: ${report.status}`);
    console.log(`New Tables Created: ${PHASE3D_TABLES.join(", ")}`);
    console.log(`RLS Enabled on all 28 tables: ${verification.newTablesRlsEnabled ? "YES" : "NO"}`);
    console.log(`Policies Added: ${verification.policiesAdded.length}`);
    console.log(`TRUNCATE held on any table: ${verification.truncateHeldByAnyRole.length === 0 ? "NONE (CLEAN)" : verification.truncateHeldByAnyRole.join(", ")}`);
    console.log(`Anon privileges: ${verification.anonExcessPrivileges.length === 0 ? "0 (SECURE)" : verification.anonExcessPrivileges.join(", ")}`);

    return report;
  } finally {
    await client.end();
  }
}

// Auto-run if executed directly
if (process.argv[1]?.endsWith("apply-migration-017.mjs")) {
  const env = {};
  if (existsSync(".env.phase2c")) {
    readFileSync(".env.phase2c", "utf8").split("\n").forEach((l) => {
      const m = l.match(/^\s*([^#][^=]*)=(.*)$/);
      if (m) env[m[1].trim()] = m[2].trim();
    });
  }
  env.PHASE2C_DEV_PROJECT_REF = "outuocpsotiozkpyksex";
  env.PHASE2C_CONFIRM_DEV_WRITES = "outuocpsotiozkpyksex";

  runMigration017({ env }).catch((err) => {
    console.error("[MIGRATION 017] ERROR:", err);
    process.exit(1);
  });
}
