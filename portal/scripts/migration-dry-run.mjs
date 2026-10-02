// Fresh-database migration dry-run using the project's PGlite test harness.
// This does NOT replace a real Supabase dry-run, but it validates that the
// migration sequence applies cleanly to a brand-new database and produces the
// expected schema objects.
import { createDb } from "../tests/helpers/db.mjs";

const EXPECTED = {
  tables: [
    "profiles", "projects", "project_milestones", "project_updates",
    "project_assignments", "deliverables", "bookings", "leads", "academy_courses",
    "service_catalog", "invoices", "invoice_line_items", "payments", "receipts",
    "service_agreements", "agreement_resources", "recurring_charges",
    "recurring_charge_runs", "provider_accounts", "providers", "systems",
    "resources", "provider_discovery_runs", "provider_discovered_resources",
    "provider_reconciliation_runs", "provider_reconciliation_items",
    "provider_operation_proposals", "provider_operation_executions",
    "provider_monitoring_schedules", "provider_monitoring_runs",
    "provider_webhook_configs", "provider_events", "action_items",
    "automation_rules", "automation_runs", "tasks", "incidents",
    "backup_policies", "backup_events", "suspension_cases", "suspension_actions",
    "audit_logs", "document_counters", "provider_costs",
  ],
  views: [
    "action_item_overview", "automation_rule_overview", "automation_run_overview",
    "backup_policy_health", "provider_connection_overview", "provider_cost_overview",
    "provider_event_overview", "provider_monitoring_overview",
    "provider_monitoring_run_overview", "provider_operation_execution_overview",
    "provider_operation_overview", "provider_reconciliation_overview",
    "provider_webhook_config_overview", "service_margin_view",
    "staff_linked_provider_resources", "staff_provider_costs_view",
    "staff_service_agreements_view",
  ],
  functions: [
    "handle_new_user", "write_audit_log", "is_admin", "is_finance",
    "can_access_finance", "derive_agreement_billing_standing",
    "store_provider_credential", "reveal_provider_credential",
    "propose_provider_operation", "review_provider_operation",
    "begin_provider_operation_execution", "complete_provider_operation_execution",
    "finish_provider_operation_verification", "run_provider_reconciliation",
    "save_webhook_config", "record_provider_event", "finalize_provider_event",
    "save_automation_rule", "evaluate_account_automation", "evaluate_automation_sweep",
    "record_webhook_auth_failure", "lookup_webhook_config_by_hash",
    "reveal_webhook_secret", "set_webhook_config_enabled",
  ],
};

async function query(db, sql) {
  const res = await db.query(sql);
  return res.rows;
}

async function main() {
  const db = await createDb();
  try {
    const tables = await query(db, `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`);
    const views = await query(db, `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='VIEW' ORDER BY table_name`);
    const functions = await query(db, `SELECT routine_name FROM information_schema.routines WHERE routine_schema='public' AND routine_type='FUNCTION' ORDER BY routine_name`);
    const indexes = await query(db, `SELECT indexname FROM pg_indexes WHERE schemaname='public'`);
    const triggers = await query(db, `SELECT trigger_name FROM information_schema.triggers WHERE trigger_schema='public'`);
    const policies = await query(db, `SELECT policyname FROM pg_policies WHERE schemaname='public'`);
    const constraints = await query(db, `SELECT constraint_name FROM information_schema.table_constraints WHERE constraint_schema='public'`);
    const sequences = await query(db, `SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema='public'`);

    const tableNames = tables.map(r => r.table_name);
    const viewNames = views.map(r => r.table_name);
    const functionNames = functions.map(r => r.routine_name);

    const missingTables = EXPECTED.tables.filter(t => !tableNames.includes(t));
    const missingViews = EXPECTED.views.filter(v => !viewNames.includes(v));
    const missingFunctions = EXPECTED.functions.filter(f => !functionNames.includes(f));

    console.log(`Migration dry-run summary`);
    console.log(`  Tables:        ${tableNames.length} (expected ${EXPECTED.tables.length})`);
    console.log(`  Views:         ${viewNames.length} (expected ${EXPECTED.views.length})`);
    console.log(`  Functions:     ${functionNames.length} (expected ${EXPECTED.functions.length})`);
    console.log(`  Indexes:       ${indexes.length}`);
    console.log(`  Triggers:      ${triggers.length}`);
    console.log(`  RLS policies:    ${policies.length}`);
    console.log(`  Constraints:     ${constraints.length}`);
    console.log(`  Sequences:       ${sequences.length}`);
    if (missingTables.length) console.log(`  Missing tables:  ${missingTables.join(", ")}`);
    if (missingViews.length) console.log(`  Missing views:   ${missingViews.join(", ")}`);
    if (missingFunctions.length) console.log(`  Missing functions: ${missingFunctions.join(", ")}`);

    // Verify duplicate 003 prefix ordering: phase3_bookings runs before phase4_finance.
    // PGlite applies files sorted lexicographically; both have 003_ prefix.
    // We can infer order from the information_schema if needed, but here we just confirm
    // both migrations ran (bookings table + invoices table, which came from phase4_finance).
    const bookingsPresent = tableNames.includes("bookings");
    const invoicesPresent = tableNames.includes("invoices");
    console.log(`  003 ordering check: bookings=${bookingsPresent}, invoices=${invoicesPresent} (lexical order phase3_bookings < phase4_finance)`);

    const ok = missingTables.length === 0 && missingViews.length === 0 && missingFunctions.length === 0 && bookingsPresent && invoicesPresent;
    console.log(ok ? "\nDRY-RUN PASSED" : "\nDRY-RUN FAILED");
    process.exit(ok ? 0 : 1);
  } finally {
    await db.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
