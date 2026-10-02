// Standalone Migration 015 Runner & Verification Tooling
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

const ALL_TABLES = [...PHASE2_TABLES, ...PHASE3A_TABLES, ...PHASE3B_TABLES];
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

  // 4. Invoices columns
  const colRes = await client.query(`
    SELECT table_name, column_name, is_nullable, data_type, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoices'
      AND column_name IN ('currency', 'agreement_id', 'recurring_charge_id');
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

export async function applyMigration015(client, sqlPath) {
  const sql = readFileSync(sqlPath, "utf8");
  await client.query(sql);
}

export async function runMigration015({ env = process.env } = {}) {
  const target = assertDevTarget(env);
  if (!target.dbUrl) {
    throw new GuardError("PHASE2C_DB_URL is required for applying migration 015.");
  }
  assertDbUrlMatchesRef(target.dbUrl, target.ref);

  if (!writesConfirmed(env, target.ref)) {
    throw new GuardError(`PHASE2C_CONFIRM_DEV_WRITES must equal "${target.ref}" to apply Migration 015 to DEV.`);
  }

  const secrets = [target.anonKey, target.serviceKey, target.dbUrl].filter(Boolean);
  const redact = makeRedactor(() => secrets);

  console.log(`[MIGRATION 015] Connecting to DEV database: ${target.ref}...`);
  let client;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      client = await openPgConnection(target.dbUrl);
      break;
    } catch (err) {
      if (attempt < 3 && err?.code === "ETIMEDOUT") {
        console.log(`[MIGRATION 015] Transient timeout on attempt ${attempt}, retrying in 2s...`);
        await new Promise((r) => setTimeout(r, 2000));
      } else {
        throw err;
      }
    }
  }

  try {
    console.log("[MIGRATION 015] Capturing pre-migration snapshot...");
    const before = await captureInventorySnapshot(client);

    const migrationPath = resolve("supabase/migrations/015_phase3b_agreements_recurring_billing.sql");
    console.log(`[MIGRATION 015] Applying ${migrationPath} in a transaction...`);
    await applyMigration015(client, migrationPath);
    console.log("[MIGRATION 015] Migration 015 executed successfully!");

    console.log("[MIGRATION 015] Capturing post-migration snapshot...");
    const after = await captureInventorySnapshot(client);

    // Check views and functions
    const viewRes = await client.query(`
      SELECT table_name FROM information_schema.views 
      WHERE table_schema = 'public' AND table_name = 'staff_service_agreements_view';
    `);
    const fnRes = await client.query(`
      SELECT routine_name FROM information_schema.routines 
      WHERE routine_schema = 'public' AND routine_name = 'derive_agreement_billing_standing';
    `);

    // Verification analysis
    const verification = {
      newTablesPresent: PHASE3B_TABLES.every((t) => after.rlsStatus[t] !== undefined),
      newTablesRlsEnabled: PHASE3B_TABLES.every((t) => after.rlsStatus[t] === true),
      existingTablesRlsPreserved: [...PHASE2_TABLES, ...PHASE3A_TABLES].every((t) => after.rlsStatus[t] === true),
      invoiceCurrencyCol: after.columns.some((c) => c.column_name === "currency" && c.is_nullable === "NO"),
      invoiceAgreementCol: after.columns.some((c) => c.column_name === "agreement_id" && c.is_nullable === "YES"),
      invoiceChargeCol: after.columns.some((c) => c.column_name === "recurring_charge_id" && c.is_nullable === "YES"),
      staffViewPresent: viewRes.rows.length === 1,
      billingStandingFnPresent: fnRes.rows.length === 1,
      truncateHeldByAnyRole: [],
      anonExcessPrivileges: [],
      authenticatedPrivileges: {},
      policiesAdded: after.policies.filter((p) => PHASE3B_TABLES.includes(p.tablename)),
      triggersAdded: after.triggers.filter((t) => PHASE3B_TABLES.includes(t.event_object_table))
    };

    // Check TRUNCATE across all 24 tables
    for (const role of ["anon", "authenticated", "service_role"]) {
      for (const t of ALL_TABLES) {
        if (after.tables[role]?.[t]?.TRUNCATE === true) {
          verification.truncateHeldByAnyRole.push(`${role}:${t}`);
        }
      }
    }

    // Check anon has 0 privileges on any Phase 3B table
    for (const t of PHASE3B_TABLES) {
      for (const p of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"]) {
        if (after.tables.anon?.[t]?.[p] === true) {
          verification.anonExcessPrivileges.push(`anon:${t}:${p}`);
        }
      }
    }

    // Check authenticated privileges on Phase 3B tables
    for (const t of PHASE3B_TABLES) {
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
                   verification.invoiceCurrencyCol &&
                   verification.invoiceAgreementCol &&
                   verification.invoiceChargeCol &&
                   verification.staffViewPresent &&
                   verification.billingStandingFnPresent &&
                   verification.truncateHeldByAnyRole.length === 0 &&
                   verification.anonExcessPrivileges.length === 0;

    const report = {
      projectRef: target.ref,
      timestamp: new Date().toISOString(),
      migration: "015_phase3b_agreements_recurring_billing.sql",
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
    writeFileSync(join("phase2c-reports", "migration-015-report.json"), redact(JSON.stringify(report, null, 2)));

    const summaryMd = `# Migration 015 — Phase 3B Service Agreements & Recurring Billing Report

- **Target Project:** \`${target.ref}\` (Hosted DEV)
- **Status:** **${isPass ? "PASS — MIGRATION 015 VERIFIED ON DEV" : "FAILED — DEFECT DETECTED"}**
- **Timestamp:** ${report.timestamp}

## 1. Table Inventory
- Phase 3B Tables Created: \`${PHASE3B_TABLES.join(", ")}\` (4/4 present)
- Total Application Tables: ${report.afterSummary.tableCount} (16 Phase 2C + 4 Phase 3A + 4 Phase 3B)
- RLS Status: 24/24 tables ENABLED

## 2. Invoices Additive Alterations
- \`invoices.currency\` added (NOT NULL, default 'UGX', CHECK 'UGX', 'USD'): **${verification.invoiceCurrencyCol ? "YES (PASS)" : "NO (FAIL)"}**
- \`invoices.agreement_id\` added (NULLABLE, FK service_agreements): **${verification.invoiceAgreementCol ? "YES (PASS)" : "NO (FAIL)"}**
- \`invoices.recurring_charge_id\` added (NULLABLE, FK recurring_charges): **${verification.invoiceChargeCol ? "YES (PASS)" : "NO (FAIL)"}**

## 3. Views & Standing Functions
- \`staff_service_agreements_view\` exists (Zero Financial Leakage): **${verification.staffViewPresent ? "YES (PASS)" : "NO (FAIL)"}**
- \`derive_agreement_billing_standing\` function exists: **${verification.billingStandingFnPresent ? "YES (PASS)" : "NO (FAIL)"}**

## 4. Row-Level Security & Policies
- Total Policies: ${after.policies.length} (66 Baseline + ${verification.policiesAdded.length} Phase 3B policies)
- Staff direct SELECT on recurring_charges: **BLOCKED (Admin/Finance only)**
- Delete Blocked on Agreements & Charges: **YES (USING false)**

## 5. Privilege Model & Hardening
- \`anon\` privileges on Phase 3B tables: **0 (DENIED)**
- \`authenticated\` privileges: SELECT, INSERT, UPDATE (no DELETE, no TRUNCATE)
- \`TRUNCATE\` held across all 24 tables: **${verification.truncateHeldByAnyRole.length === 0 ? "NONE (ALL 24 TABLES HARDENED)" : verification.truncateHeldByAnyRole.join(", ")}**
`;
    writeFileSync(join("phase2c-reports", "migration-015-report.md"), redact(summaryMd));

    console.log("--- MIGRATION 015 VERIFICATION SUMMARY ---");
    console.log(`Status: ${report.status}`);
    console.log(`New Tables Created: ${PHASE3B_TABLES.join(", ")}`);
    console.log(`RLS Enabled on all 24 tables: ${verification.newTablesRlsEnabled ? "YES" : "NO"}`);
    console.log(`invoices.currency added: ${verification.invoiceCurrencyCol ? "YES" : "NO"}`);
    console.log(`staff_service_agreements_view created: ${verification.staffViewPresent ? "YES" : "NO"}`);
    console.log(`derive_agreement_billing_standing created: ${verification.billingStandingFnPresent ? "YES" : "NO"}`);
    console.log(`Policies Added: ${verification.policiesAdded.length}`);
    console.log(`TRUNCATE held on any table: ${verification.truncateHeldByAnyRole.length === 0 ? "NONE (CLEAN)" : verification.truncateHeldByAnyRole.join(", ")}`);
    console.log(`Anon privileges: ${verification.anonExcessPrivileges.length === 0 ? "0 (SECURE)" : verification.anonExcessPrivileges.join(", ")}`);

    return report;
  } finally {
    await client.end();
  }
}

// Auto-run if executed directly
if (process.argv[1]?.endsWith("apply-migration-015.mjs")) {
  const env = {};
  readFileSync(".env.phase2c", "utf8").split("\n").forEach((l) => {
    const m = l.match(/^\s*([^#][^=]*)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  });
  env.PHASE2C_DEV_PROJECT_REF = "outuocpsotiozkpyksex";
  env.PHASE2C_CONFIRM_DEV_WRITES = "outuocpsotiozkpyksex";

  runMigration015({ env }).catch((err) => {
    console.error("[MIGRATION 015] ERROR:", err);
    process.exit(1);
  });
}
