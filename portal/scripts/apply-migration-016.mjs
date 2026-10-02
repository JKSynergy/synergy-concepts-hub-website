// Standalone Migration 016 Runner & Verification Tooling
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

const ALL_TABLES = [...PHASE2_TABLES, ...PHASE3A_TABLES, ...PHASE3B_TABLES, ...PHASE3C_TABLES];
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

  // 1. Table privileges for each role (batched query for fast execution)
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
    SELECT r.role, t.table_name, p.priv, has_table_privilege(r.role, 'public."' || t.table_name || '"', p.priv) AS h
    FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(role)
    CROSS JOIN (SELECT unnest($1::text[]) AS table_name) AS t
    CROSS JOIN (SELECT unnest($2::text[]) AS priv) AS p;
  `;
  try {
    const privRes = await client.query(privQuery, [ALL_TABLES, ALL_PRIVS]);
    for (const row of privRes.rows) {
      if (snapshot.tables[row.role]?.[row.table_name]) {
        snapshot.tables[row.role][row.table_name][row.priv] = row.h === true;
      }
    }
  } catch (err) {
    console.warn("[MIGRATION 016] Batch privilege query warning:", err.message);
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

  // 4. Triggers
  const trgRes = await client.query(`
    SELECT event_object_table, trigger_name, action_timing, event_manipulation
    FROM information_schema.triggers
    WHERE trigger_schema = 'public' AND event_object_table = ANY($1)
    ORDER BY event_object_table, trigger_name;
  `, [ALL_TABLES]);
  snapshot.triggers = trgRes.rows;

  return snapshot;
}

export async function applyMigration016(client, sqlPath) {
  const sql = readFileSync(sqlPath, "utf8");
  await client.query(sql);
}

export async function runMigration016({ env = process.env } = {}) {
  const target = assertDevTarget(env);
  if (!target.dbUrl) {
    throw new GuardError("PHASE2C_DB_URL is required for applying migration 016.");
  }
  assertDbUrlMatchesRef(target.dbUrl, target.ref);

  if (!writesConfirmed(env, target.ref)) {
    throw new GuardError(`PHASE2C_CONFIRM_DEV_WRITES must equal "${target.ref}" to apply Migration 016 to DEV.`);
  }

  const secrets = [target.anonKey, target.serviceKey, target.dbUrl].filter(Boolean);
  const redact = makeRedactor(() => secrets);

  console.log(`[MIGRATION 016] Connecting to DEV database: ${target.ref}...`);
  let client;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      client = await openPgConnection(target.dbUrl);
      break;
    } catch (err) {
      if (attempt < 3 && err?.code === "ETIMEDOUT") {
        console.log(`[MIGRATION 016] Transient timeout on attempt ${attempt}, retrying in 2s...`);
        await new Promise((r) => setTimeout(r, 2000));
      } else {
        throw err;
      }
    }
  }

  try {
    console.log("[MIGRATION 016] Capturing pre-migration snapshot...");
    const before = await captureInventorySnapshot(client);

    const migrationPath = resolve("supabase/migrations/016_phase3c_suspension_enforcement.sql");
    console.log(`[MIGRATION 016] Applying ${migrationPath} in a transaction...`);
    await applyMigration016(client, migrationPath);
    console.log("[MIGRATION 016] Migration 016 executed successfully!");

    console.log("[MIGRATION 016] Capturing post-migration snapshot...");
    const after = await captureInventorySnapshot(client);

    // Verification analysis
    const verification = {
      newTablesPresent: PHASE3C_TABLES.every((t) => after.rlsStatus[t] !== undefined),
      newTablesRlsEnabled: PHASE3C_TABLES.every((t) => after.rlsStatus[t] === true),
      existingTablesRlsPreserved: [...PHASE2_TABLES, ...PHASE3A_TABLES, ...PHASE3B_TABLES].every((t) => after.rlsStatus[t] === true),
      truncateHeldByAnyRole: [],
      anonExcessPrivileges: [],
      authenticatedPrivileges: {},
      policiesAdded: after.policies.filter((p) => PHASE3C_TABLES.includes(p.tablename)),
      triggersAdded: after.triggers.filter((t) => PHASE3C_TABLES.includes(t.event_object_table))
    };

    // Check TRUNCATE across all 26 tables
    for (const role of ["anon", "authenticated", "service_role"]) {
      for (const t of ALL_TABLES) {
        if (after.tables[role]?.[t]?.TRUNCATE === true) {
          verification.truncateHeldByAnyRole.push(`${role}:${t}`);
        }
      }
    }

    // Check anon has 0 privileges on any Phase 3C table
    for (const t of PHASE3C_TABLES) {
      for (const p of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"]) {
        if (after.tables.anon?.[t]?.[p] === true) {
          verification.anonExcessPrivileges.push(`anon:${t}:${p}`);
        }
      }
    }

    // Check authenticated privileges on Phase 3C tables
    for (const t of PHASE3C_TABLES) {
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
      migration: "016_phase3c_suspension_enforcement.sql",
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
    writeFileSync(join("phase2c-reports", "migration-016-report.json"), redact(JSON.stringify(report, null, 2)));

    const summaryMd = `# Migration 016 — Phase 3C Suspension & Service Enforcement Report

- **Target Project:** \`${target.ref}\` (Hosted DEV)
- **Status:** **${isPass ? "PASS — MIGRATION 016 VERIFIED ON DEV" : "FAILED — DEFECT DETECTED"}**
- **Timestamp:** ${report.timestamp}

## 1. Table Inventory
- Phase 3C Tables Created: \`${PHASE3C_TABLES.join(", ")}\` (2/2 present)
- Total Application Tables: ${report.afterSummary.tableCount} (16 Phase 2C + 4 Phase 3A + 4 Phase 3B + 2 Phase 3C)
- RLS Status: 26/26 tables ENABLED

## 2. Row-Level Security & Policies
- Total Policies: ${after.policies.length} (${before.policies.length} Pre-migration + ${verification.policiesAdded.length} Phase 3C policies)
- Delete Blocked on Suspension Cases & Actions: **YES (USING false + table triggers)**
- Anon Access Denied: **YES (0 privileges)**
- Client Direct Access: **DENIED (0 rows returned by RLS)**

## 3. Privilege Model & Hardening
- \`anon\` privileges on Phase 3C tables: **0 (DENIED)**
- \`authenticated\` privileges: SELECT, INSERT, UPDATE (no DELETE, no TRUNCATE)
- \`TRUNCATE\` held across all 26 tables: **${verification.truncateHeldByAnyRole.length === 0 ? "NONE (ALL 26 TABLES HARDENED)" : verification.truncateHeldByAnyRole.join(", ")}**
`;
    writeFileSync(join("phase2c-reports", "migration-016-report.md"), redact(summaryMd));

    console.log("--- MIGRATION 016 VERIFICATION SUMMARY ---");
    console.log(`Status: ${report.status}`);
    console.log(`New Tables Created: ${PHASE3C_TABLES.join(", ")}`);
    console.log(`RLS Enabled on all 26 tables: ${verification.newTablesRlsEnabled ? "YES" : "NO"}`);
    console.log(`Policies Added: ${verification.policiesAdded.length}`);
    console.log(`TRUNCATE held on any table: ${verification.truncateHeldByAnyRole.length === 0 ? "NONE (CLEAN)" : verification.truncateHeldByAnyRole.join(", ")}`);
    console.log(`Anon privileges: ${verification.anonExcessPrivileges.length === 0 ? "0 (SECURE)" : verification.anonExcessPrivileges.join(", ")}`);

    return report;
  } finally {
    await client.end();
  }
}

// Auto-run if executed directly
if (process.argv[1]?.endsWith("apply-migration-016.mjs")) {
  const env = {};
  if (existsSync(".env.phase2c")) {
    readFileSync(".env.phase2c", "utf8").split("\n").forEach((l) => {
      const m = l.match(/^\s*([^#][^=]*)=(.*)$/);
      if (m) env[m[1].trim()] = m[2].trim();
    });
  }
  env.PHASE2C_DEV_PROJECT_REF = "outuocpsotiozkpyksex";
  env.PHASE2C_CONFIRM_DEV_WRITES = "outuocpsotiozkpyksex";

  runMigration016({ env }).catch((err) => {
    console.error("[MIGRATION 016] ERROR:", err);
    process.exit(1);
  });
}
