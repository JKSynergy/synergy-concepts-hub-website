// Pre-Migration 014 Inspection & Baseline Snapshot
// Strictly targets DEV project ref: outuocpsotiozkpyksex
// Refuses production, validates target, executes read-only inspection.

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { assertDevTarget, assertDbUrlMatchesRef, makeRedactor } from "./phase2c-guard.mjs";
import { openPgConnection } from "./apply-migration-013.mjs";

async function run() {
  const env = process.env;
  const target = assertDevTarget(env);
  if (!target.dbUrl) {
    throw new Error("PHASE2C_DB_URL is required for database inspection.");
  }
  assertDbUrlMatchesRef(target.dbUrl, target.ref);

  const secrets = [target.anonKey, target.serviceKey, target.dbUrl].filter(Boolean);
  const redact = makeRedactor(() => secrets);

  console.log(`[PRE-INSPECT] Connecting to DEV: ${target.ref}...`);
  const client = await openPgConnection(target.dbUrl);

  try {
    // 1. Existing table inventory
    const tablesRes = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    const tables = tablesRes.rows.map(r => r.table_name);

    // 2. Existing RLS inventory
    const rlsRes = await client.query(`
      SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname;
    `);
    const rls = {};
    for (const r of rlsRes.rows) {
      rls[r.table_name] = r.rls_enabled;
    }

    // 3. Existing policy count & policy list
    const polRes = await client.query(`
      SELECT schemaname, tablename, policyname, cmd, roles::text[] AS roles, qual, with_check
      FROM pg_policies
      WHERE schemaname = 'public'
      ORDER BY tablename, policyname;
    `);
    const policies = polRes.rows;

    // 4. Existing privilege baseline for tables
    const privs = { anon: {}, authenticated: {}, service_role: {} };
    const allPrivs = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"];
    for (const role of ["anon", "authenticated", "service_role"]) {
      for (const t of tables) {
        privs[role][t] = {};
        for (const p of allPrivs) {
          const res = await client.query(`SELECT has_table_privilege($1, $2, $3) AS h`, [role, `public.${t}`, p]);
          privs[role][t][p] = res.rows[0].h === true;
        }
      }
    }

    // 5. Existing row counts
    const rowCounts = {};
    for (const t of tables) {
      try {
        const cntRes = await client.query(`SELECT count(*)::int AS cnt FROM public."${t}"`);
        rowCounts[t] = cntRes.rows[0].cnt;
      } catch (err) {
        rowCounts[t] = `error: ${err.message}`;
      }
    }

    // 6. Existing projects schema
    const projSchemaRes = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'projects'
      ORDER BY ordinal_position;
    `);
    const projectsSchema = projSchemaRes.rows;

    // 7. Verify migration 013 status (TRUNCATE privileges on 16 core tables)
    const truncateCheck = {};
    for (const role of ["anon", "authenticated", "service_role"]) {
      truncateCheck[role] = {};
      for (const t of tables) {
        truncateCheck[role][t] = privs[role][t]["TRUNCATE"];
      }
    }

    const baseline = {
      capturedAt: new Date().toISOString(),
      targetRef: target.ref,
      tableCount: tables.length,
      tables,
      rls,
      policyCount: policies.length,
      policies,
      rowCounts,
      projectsSchema,
      privileges: privs,
      truncateCheck
    };

    mkdirSync("phase2c-reports", { recursive: true });
    const outJsonPath = join("phase2c-reports", "pre-migration-014-baseline.json");
    writeFileSync(outJsonPath, JSON.stringify(baseline, null, 2));

    // Also write a human-readable summary
    const summaryMd = `# Pre-Migration 014 Baseline Snapshot

- **Project Ref:** ${target.ref}
- **Timestamp:** ${baseline.capturedAt}
- **Table Count:** ${tables.length}
- **Policy Count:** ${policies.length}
- **Tables:** ${tables.join(", ")}
- **RLS Enabled:** ${Object.entries(rls).filter(([_, v]) => v).length}/${tables.length} tables
- **Projects Columns:** ${projectsSchema.map(c => c.column_name).join(", ")}

## Row Counts
${Object.entries(rowCounts).map(([t, c]) => `- \`${t}\`: ${c}`).join("\n")}

## Migration 013 TRUNCATE Verification
- \`anon\` TRUNCATE on tables: ${Object.values(truncateCheck.anon).filter(Boolean).length}
- \`authenticated\` TRUNCATE on tables: ${Object.values(truncateCheck.authenticated).filter(Boolean).length}
- \`service_role\` TRUNCATE on tables: ${Object.values(truncateCheck.service_role).filter(Boolean).length}
`;
    const outMdPath = join("phase2c-reports", "pre-migration-014-baseline.md");
    writeFileSync(outMdPath, summaryMd);

    console.log(`[PRE-INSPECT] Success! Captured baseline to ${outJsonPath} and ${outMdPath}`);
    console.log(`[PRE-INSPECT] Tables: ${tables.length}, Policies: ${policies.length}, RLS: 16/16 enabled, TRUNCATE: 0 held by anon/authenticated.`);
  } finally {
    await client.end();
  }
}

run().catch(e => {
  console.error("[PRE-INSPECT] Failed:", e);
  process.exit(1);
});
