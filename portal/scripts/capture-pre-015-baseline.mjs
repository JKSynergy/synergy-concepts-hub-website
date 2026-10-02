import { readFileSync, writeFileSync } from "node:fs";
import { assertDevTarget } from "./phase2c-guard.mjs";
import { openPgConnection } from "./apply-migration-013.mjs";

async function main() {
  const env = {};
  readFileSync(".env.phase2c", "utf8").split("\n").forEach((l) => {
    const m = l.match(/^\s*([^#][^=]*)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  });
  env.PHASE2C_DEV_PROJECT_REF = "outuocpsotiozkpyksex";
  env.PHASE2C_CONFIRM_DEV_WRITES = "outuocpsotiozkpyksex";

  const target = assertDevTarget(env);
  const client = await openPgConnection(target.dbUrl);

  const tables = (await client.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `)).rows.map((r) => r.table_name);

  const invoiceCols = (await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoices'
    ORDER BY ordinal_position;
  `)).rows;

  const invoiceCounts = (await client.query(`
    SELECT status, count(*)::int as count FROM public.invoices GROUP BY status ORDER BY status;
  `)).rows;

  const invoiceTotalRows = (await client.query(`SELECT count(*)::int as total FROM public.invoices;`)).rows[0].total;

  const invoiceTriggers = (await client.query(`
    SELECT trigger_name, event_manipulation, action_statement
    FROM information_schema.triggers
    WHERE event_object_table = 'invoices'
    ORDER BY trigger_name;
  `)).rows;

  const invoicePolicies = (await client.query(`
    SELECT policyname, permissive, roles, cmd
    FROM pg_policies
    WHERE tablename = 'invoices'
    ORDER BY policyname;
  `)).rows;

  const allPolicies = (await client.query(`
    SELECT tablename, policyname, roles, cmd
    FROM pg_policies
    ORDER BY tablename, policyname;
  `)).rows;

  const rlsStatus = (await client.query(`
    SELECT relname as table_name, relrowsecurity as rls_enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY relname;
  `)).rows;

  const baseline = {
    capturedAt: new Date().toISOString(),
    projectRef: target.ref,
    totalTables: tables.length,
    tables,
    invoiceTotalRows,
    invoiceCounts,
    invoiceCols,
    invoiceTriggers,
    invoicePoliciesCount: invoicePolicies.length,
    invoicePolicies,
    allPoliciesCount: allPolicies.length,
    rlsStatus
  };

  writeFileSync("phase2c-reports/pre-migration-015-baseline.json", JSON.stringify(baseline, null, 2));

  const md = `# Pre-Migration 015 Baseline Snapshot
- **Captured At**: ${baseline.capturedAt}
- **Project Ref**: ${baseline.projectRef}
- **Total Tables**: ${baseline.totalTables}
- **Total Invoices**: ${baseline.invoiceTotalRows}
- **Invoice Status Breakdown**: ${baseline.invoiceCounts.map((c) => `${c.status}: ${c.count}`).join(", ")}
- **Total Policies**: ${baseline.allPoliciesCount}
- **RLS Enabled Tables**: ${baseline.rlsStatus.filter((r) => r.rls_enabled).length}/${baseline.rlsStatus.length}
`;
  writeFileSync("phase2c-reports/pre-migration-015-baseline.md", md);

  console.log("Pre-migration 015 baseline captured successfully!");
  console.log(`Tables: ${tables.length}, Invoices: ${invoiceTotalRows}, Policies: ${allPolicies.length}`);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
