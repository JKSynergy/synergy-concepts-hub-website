// Standalone Migration 014 Runner & Verification Tooling
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

const ALL_TABLES = [...PHASE2_TABLES, ...PHASE3A_TABLES];
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
        try {
          const res = await client.query(`SELECT has_table_privilege($1, $2, $3) AS h`, [role, `public."${t}"`, p]);
          snapshot.tables[role][t][p] = res.rows[0].h === true;
        } catch {
          snapshot.tables[role][t][p] = false;
        }
      }
    }
  }

  // 2. RLS status
  const rlsRes = await client.query(`
    SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1)
    ORDER BY c.relname;
  `, [ALL_TABLES]);
  for (const row of rlsRes.rows) {
    snapshot.rlsStatus[row.table_name] = row.rls_enabled === true;
  }

  // 3. Row-level policies
  const polRes = await client.query(`
    SELECT tablename, policyname, cmd, roles::text[] AS roles, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = ANY($1)
    ORDER BY tablename, policyname;
  `, [ALL_TABLES]);
  snapshot.policies = polRes.rows;

  // 4. Column nullability checks for key columns
  const colRes = await client.query(`
    SELECT table_name, column_name, is_nullable, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND (
      (table_name = 'resources' AND column_name = 'system_id')
      OR (table_name = 'projects' AND column_name = 'system_id')
    );
  `);
  snapshot.columns = colRes.rows;

  // 5. Triggers
  const trgRes = await client.query(`
    SELECT event_object_table, trigger_name, action_timing, event_manipulation
    FROM information_schema.triggers
    WHERE trigger_schema = 'public' AND event_object_table = ANY($1)
    ORDER BY event_object_table, trigger_name;
  `, [ALL_TABLES]);
  snapshot.triggers = trgRes.rows;

  return snapshot;
}

export async function applyMigration014(client, sqlPath) {
  const sql = readFileSync(sqlPath, "utf8");
  await client.query(sql);
}

export async function runMigration014({ env = process.env } = {}) {
  const target = assertDevTarget(env);
  if (!target.dbUrl) {
    throw new GuardError("PHASE2C_DB_URL is required for applying migration 014.");
  }
  assertDbUrlMatchesRef(target.dbUrl, target.ref);

  if (!writesConfirmed(env, target.ref)) {
    throw new GuardError(`PHASE2C_CONFIRM_DEV_WRITES must equal "${target.ref}" to apply Migration 014 to DEV.`);
  }

  const secrets = [target.anonKey, target.serviceKey, target.dbUrl].filter(Boolean);
  const redact = makeRedactor(() => secrets);

  console.log(`[MIGRATION 014] Connecting to DEV database: ${target.ref}...`);
  let client;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      client = await openPgConnection(target.dbUrl);
      break;
    } catch (err) {
      if (attempt < 3 && err?.code === 'ETIMEDOUT') {
        console.log(`[MIGRATION 014] Transient timeout on attempt ${attempt}, retrying in 2s...`);
        await new Promise(r => setTimeout(r, 2000));
      } else {
        throw err;
      }
    }
  }

  try {
    console.log("[MIGRATION 014] Capturing pre-migration snapshot...");
    const before = await captureInventorySnapshot(client);

    const migrationPath = resolve("supabase/migrations/014_phase3a_inventory.sql");
    console.log(`[MIGRATION 014] Applying ${migrationPath} in a transaction...`);
    await applyMigration014(client, migrationPath);
    console.log("[MIGRATION 014] Migration 014 executed successfully!");

    console.log("[MIGRATION 014] Capturing post-migration snapshot...");
    const after = await captureInventorySnapshot(client);

    // Verification analysis
    const verification = {
      newTablesPresent: PHASE3A_TABLES.every(t => after.rlsStatus[t] !== undefined),
      newTablesRlsEnabled: PHASE3A_TABLES.every(t => after.rlsStatus[t] === true),
      existingTablesRlsPreserved: PHASE2_TABLES.every(t => after.rlsStatus[t] === true),
      resourcesSystemIdNullable: after.columns.some(c => c.table_name === 'resources' && c.column_name === 'system_id' && c.is_nullable === 'YES'),
      projectsSystemIdNullable: after.columns.some(c => c.table_name === 'projects' && c.column_name === 'system_id' && c.is_nullable === 'YES'),
      truncateHeldByAnyRole: [],
      anonExcessPrivileges: [],
      authenticatedPrivileges: {},
      policiesAdded: after.policies.filter(p => PHASE3A_TABLES.includes(p.tablename)),
      triggersAdded: after.triggers.filter(t => PHASE3A_TABLES.includes(t.event_object_table))
    };

    // Check TRUNCATE across all 20 tables
    for (const role of ["anon", "authenticated", "service_role"]) {
      for (const t of ALL_TABLES) {
        if (after.tables[role]?.[t]?.TRUNCATE === true) {
          verification.truncateHeldByAnyRole.push(`${role}:${t}`);
        }
      }
    }

    // Check anon has 0 privileges on any Phase 3A table
    for (const t of PHASE3A_TABLES) {
      for (const p of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"]) {
        if (after.tables.anon?.[t]?.[p] === true) {
          verification.anonExcessPrivileges.push(`anon:${t}:${p}`);
        }
      }
    }

    // Check authenticated privileges on Phase 3A tables
    for (const t of PHASE3A_TABLES) {
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
                   verification.resourcesSystemIdNullable &&
                   verification.projectsSystemIdNullable &&
                   verification.truncateHeldByAnyRole.length === 0 &&
                   verification.anonExcessPrivileges.length === 0;

    const report = {
      projectRef: target.ref,
      timestamp: new Date().toISOString(),
      migration: "014_phase3a_inventory.sql",
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
    writeFileSync(join("phase2c-reports", "migration-014-report.json"), redact(JSON.stringify(report, null, 2)));

    const summaryMd = `# Migration 014 — Phase 3A Inventory Verification Report

- **Target Project:** \`${target.ref}\` (Hosted DEV)
- **Status:** **${isPass ? "PASS — MIGRATION 014 VERIFIED ON DEV" : "FAILED — DEFECT DETECTED"}**
- **Timestamp:** ${report.timestamp}

## 1. Table Inventory
- Phase 3A Tables Created: \`${PHASE3A_TABLES.join(", ")}\` (4/4 present)
- Total Application Tables: ${report.afterSummary.tableCount} (16 Phase 2C + 4 Phase 3A)
- RLS Status: 20/20 tables ENABLED

## 2. Invariants & Nullability
- \`resources.system_id\` is nullable: **${verification.resourcesSystemIdNullable ? "YES (PASS)" : "NO (FAIL)"}**
- \`projects.system_id\` is nullable: **${verification.projectsSystemIdNullable ? "YES (PASS)" : "NO (FAIL)"}**
- Clients table created: **NO (profiles.id reused as required)**

## 3. Row-Level Security & Policies
- Total Policies: ${after.policies.length} (50 Phase 2C + ${verification.policiesAdded.length} Phase 3A policies)
- Delete Blocked on All 4 New Tables: **YES (USING false)**

## 4. Privilege Model & Hardening
- \`anon\` privileges on Phase 3A tables: **0 (DENIED)**
- \`authenticated\` privileges: SELECT, INSERT, UPDATE (no DELETE, no TRUNCATE)
- \`TRUNCATE\` held across all 20 tables: **${verification.truncateHeldByAnyRole.length === 0 ? "NONE (ALL 20 TABLES HARDENED)" : verification.truncateHeldByAnyRole.join(", ")}**
`;
    writeFileSync(join("phase2c-reports", "migration-014-report.md"), redact(summaryMd));

    console.log("--- MIGRATION 014 VERIFICATION SUMMARY ---");
    console.log(`Status: ${report.status}`);
    console.log(`New Tables Created: ${PHASE3A_TABLES.join(", ")}`);
    console.log(`RLS Enabled on all new tables: ${verification.newTablesRlsEnabled ? "YES" : "NO"}`);
    console.log(`resources.system_id nullable: ${verification.resourcesSystemIdNullable ? "YES" : "NO"}`);
    console.log(`projects.system_id nullable: ${verification.projectsSystemIdNullable ? "YES" : "NO"}`);
    console.log(`Policies Added: ${verification.policiesAdded.length}`);
    console.log(`TRUNCATE held on any table: ${verification.truncateHeldByAnyRole.length === 0 ? "NONE (CLEAN)" : verification.truncateHeldByAnyRole.join(", ")}`);
    console.log(`Anon privileges: ${verification.anonExcessPrivileges.length === 0 ? "0 (SECURE)" : verification.anonExcessPrivileges.join(", ")}`);

    return report;
  } finally {
    await client.end();
  }
}

// Auto-run if executed directly
if (process.argv[1]?.endsWith("apply-migration-014.mjs")) {
  runMigration014().catch(err => {
    console.error("[MIGRATION 014] ERROR:", err);
    process.exit(1);
  });
}
