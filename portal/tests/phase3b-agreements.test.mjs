// Phase 3B: Service Agreements & Recurring Billing Tests
// Validates service_agreements, agreement_resources, recurring_charges, recurring_charge_runs,
// additive invoices fields, same-client integrity, staff anti-leak, and derived billing standing.
// Uses the PGlite in-memory Postgres harness.

import test from "node:test";
import assert from "node:assert/strict";
import { createDb, asUser } from "./helpers/db.mjs";

async function setupAccounts(db) {
  const adminId = "00000000-0000-0000-0000-000000000001";
  const staffId = "00000000-0000-0000-0000-000000000002";
  const financeId = "00000000-0000-0000-0000-000000000003";
  const clientAId = "00000000-0000-0000-0000-000000000004";
  const clientBId = "00000000-0000-0000-0000-000000000005";

  for (const [id, email, role] of [
    [adminId, "admin@synergy.ug", "admin"],
    [staffId, "staff@synergy.ug", "staff"],
    [financeId, "finance@synergy.ug", "finance"],
    [clientAId, "clienta@company.com", "client"],
    [clientBId, "clientb@corp.com", "client"],
  ]) {
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${id}', '${email}') ON CONFLICT (id) DO NOTHING;
      INSERT INTO public.profiles (id, email, role) VALUES ('${id}', '${email}', '${role}') ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
    `);
  }

  return { adminId, staffId, financeId, clientAId, clientBId };
}

test("PHASE 3B: Schema creation, additive invoice columns, and currency constraints", async () => {
  const db = await createDb();
  const { adminId, clientAId } = await setupAccounts(db);

  // 1. Verify tables exist
  const tables = (await db.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name IN ('service_agreements', 'agreement_resources', 'recurring_charges', 'recurring_charge_runs')
    ORDER BY table_name;
  `)).rows.map(r => r.table_name);

  assert.deepEqual(tables, [
    "agreement_resources",
    "recurring_charge_runs",
    "recurring_charges",
    "service_agreements"
  ]);

  // 2. Verify invoices additive columns
  const invCols = (await db.query(`
    SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoices'
      AND column_name IN ('currency', 'agreement_id', 'recurring_charge_id')
    ORDER BY column_name;
  `)).rows;

  const colMap = Object.fromEntries(invCols.map(c => [c.column_name, c]));
  assert.ok(colMap["currency"], "currency column must exist");
  assert.equal(colMap["currency"].column_default, "'UGX'::character varying");
  assert.equal(colMap["currency"].is_nullable, "NO");

  assert.ok(colMap["agreement_id"], "agreement_id column must exist");
  assert.equal(colMap["agreement_id"].is_nullable, "YES");

  assert.ok(colMap["recurring_charge_id"], "recurring_charge_id column must exist");
  assert.equal(colMap["recurring_charge_id"].is_nullable, "YES");

  // 3. Verify currency constraint (UGX and USD allowed, EUR rejected)
  await db.query(`
    INSERT INTO public.invoices (client_id, invoice_number, currency, subtotal, total)
    VALUES ('${clientAId}', 'INV-TEST-001', 'USD', 100, 100);
  `);

  await assert.rejects(
    () => db.query(`
      INSERT INTO public.invoices (client_id, invoice_number, currency, subtotal, total)
      VALUES ('${clientAId}', 'INV-TEST-002', 'EUR', 100, 100);
    `),
    /violates check constraint/
  );
});

test("PHASE 3B: Same-Client Integrity Constraints (Agreements, Resources, Systems, Invoices)", async () => {
  const db = await createDb();
  const { adminId, clientAId, clientBId } = await setupAccounts(db);

  // Setup: Provider, Accounts, Systems, Resources
  await db.exec(`
    INSERT INTO public.providers (id, name, slug) VALUES ('11111111-1111-1111-1111-111111111111', 'Vercel', 'vercel');
    INSERT INTO public.provider_accounts (id, provider_id, account_name, ownership)
    VALUES ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'SCH Team', 'sch_managed');

    -- Client A System
    INSERT INTO public.systems (id, client_id, name, system_type, status)
    VALUES ('33333333-3333-3333-3333-333333333333', '${clientAId}', 'Client A Web Platform', 'web_platform', 'live');

    -- Client B System
    INSERT INTO public.systems (id, client_id, name, system_type, status)
    VALUES ('44444444-4444-4444-4444-444444444444', '${clientBId}', 'Client B Portal', 'web_platform', 'live');

    -- Client A Resource (attached to System A)
    INSERT INTO public.resources (id, system_id, provider_account_id, name, resource_type, ownership, client_id)
    VALUES ('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'Client A Frontend', 'web_app', 'sch_managed', '${clientAId}');

    -- Client B Resource (attached to System B)
    INSERT INTO public.resources (id, system_id, provider_account_id, name, resource_type, ownership, client_id)
    VALUES ('66666666-6666-6666-6666-666666666666', '44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 'Client B Frontend', 'web_app', 'sch_managed', '${clientBId}');
  `);

  // 1. Cross-client System check: Agreement for Client A with System for Client B MUST fail
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.service_agreements (client_id, system_id, name, service_type, start_date)
      VALUES ('${clientAId}', '44444444-4444-4444-4444-444444444444', 'Invalid Agreement', 'managed_service', CURRENT_DATE);
    `),
    /Agreement system must belong to the agreement client/
  );

  // 2. Valid Agreement for Client A with System for Client A succeeds
  const agA = (await db.query(`
    INSERT INTO public.service_agreements (id, client_id, system_id, name, service_type, start_date)
    VALUES ('77777777-7777-7777-7777-777777777777', '${clientAId}', '33333333-3333-3333-3333-333333333333', 'Client A SLA Agreement', 'managed_service', CURRENT_DATE)
    RETURNING id;
  `)).rows[0].id;

  // 3. Agreement Resources Same-Client Integrity:
  // Attaching Client B Resource to Client A Agreement MUST fail
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.agreement_resources (agreement_id, resource_id)
      VALUES ('${agA}', '66666666-6666-6666-6666-666666666666');
    `),
    /Resource client ownership must match agreement client|Resource attached system client must match agreement client/
  );

  // Attaching Client A Resource to Client A Agreement succeeds
  await db.query(`
    INSERT INTO public.agreement_resources (agreement_id, resource_id)
    VALUES ('${agA}', '55555555-5555-5555-5555-555555555555');
  `);

  // 4. Invoice Same-Client Integrity:
  // Invoice for Client B linking to Agreement for Client A MUST fail
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.invoices (client_id, invoice_number, agreement_id, subtotal, total)
      VALUES ('${clientBId}', 'INV-CROSS-001', '${agA}', 500, 500);
    `),
    /Invoice client must match agreement client/
  );
});

test("PHASE 3B: Recurring Charges, Idempotent Runs, and Invariant Checks", async () => {
  const db = await createDb();
  const { adminId, financeId, clientAId } = await setupAccounts(db);

  // Create active agreement
  const agA = (await db.query(`
    INSERT INTO public.service_agreements (id, client_id, name, service_type, status, start_date)
    VALUES ('77777777-7777-7777-7777-777777777777', '${clientAId}', 'Client A Cloud SLA', 'hosting', 'active', '2026-09-01')
    RETURNING id;
  `)).rows[0].id;

  // Create recurring charge
  const rcA = (await db.query(`
    INSERT INTO public.recurring_charges (id, agreement_id, name, amount, currency, billing_cycle, payment_timing, start_date)
    VALUES ('88888888-8888-8888-8888-888888888888', '${agA}', 'Monthly Cloud Hosting', 1500000, 'UGX', 'monthly', 'month_end', '2026-09-01')
    RETURNING id;
  `)).rows[0].id;

  // Create invoice for charge
  const invA = (await db.query(`
    INSERT INTO public.invoices (id, client_id, invoice_number, agreement_id, recurring_charge_id, currency, subtotal, total)
    VALUES ('99999999-9999-9999-9999-999999999999', '${clientAId}', 'INV-REC-001', '${agA}', '${rcA}', 'UGX', 1500000, 1500000)
    RETURNING id;
  `)).rows[0].id;

  // Create charge run
  await db.query(`
    INSERT INTO public.recurring_charge_runs (recurring_charge_id, period_start, period_end, invoice_id)
    VALUES ('${rcA}', '2026-09-01', '2026-09-30', '${invA}');
  `);

  // Duplicate generation for the same period MUST fail on UNIQUE constraint
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.recurring_charge_runs (recurring_charge_id, period_start, period_end, invoice_id)
      VALUES ('${rcA}', '2026-09-01', '2026-09-30', '${invA}');
    `),
    /duplicate key value violates unique constraint "uq_recurring_charge_run_period"/
  );

  // Different period succeeds
  await db.query(`
    INSERT INTO public.recurring_charge_runs (recurring_charge_id, period_start, period_end, invoice_id)
    VALUES ('${rcA}', '2026-10-01', '2026-10-31', '${invA}');
  `);
});

test("PHASE 3B: Staff Financial Anti-Leak (RLS & View Boundaries)", async () => {
  const db = await createDb();
  const { adminId, staffId, financeId, clientAId } = await setupAccounts(db);

  // Create agreement and recurring charge as Admin
  const agA = (await db.query(`
    INSERT INTO public.service_agreements (id, client_id, name, service_type, status, start_date, operational_notes)
    VALUES ('77777777-7777-7777-7777-777777777777', '${clientAId}', 'Client A Core Platform SLA', 'managed_service', 'active', '2026-09-01', 'Operational SLA 99.5%')
    RETURNING id;
  `)).rows[0].id;

  const rcA = (await db.query(`
    INSERT INTO public.recurring_charges (id, agreement_id, name, amount, currency, billing_cycle, payment_timing, start_date)
    VALUES ('88888888-8888-8888-8888-888888888888', '${agA}', 'Monthly Retainer', 2500000, 'UGX', 'monthly', 'month_end', '2026-09-01')
    RETURNING id;
  `)).rows[0].id;

  // 1. Staff query on recurring_charges MUST return 0 rows (Anti-leak)
  await asUser(db, staffId, async () => {
    const res = await db.query(`SELECT * FROM public.recurring_charges;`);
    assert.equal(res.rows.length, 0, "Staff MUST NOT see recurring charges amounts or pricing");
  });

  // 2. Staff query on recurring_charge_runs MUST return 0 rows
  await asUser(db, staffId, async () => {
    const res = await db.query(`SELECT * FROM public.recurring_charge_runs;`);
    assert.equal(res.rows.length, 0, "Staff MUST NOT see recurring charge runs");
  });

  // 3. Staff query on service_agreements succeeds for operational context
  await asUser(db, staffId, async () => {
    const res = await db.query(`SELECT id, name, service_type, status, operational_notes FROM public.service_agreements;`);
    assert.equal(res.rows.length, 1, "Staff CAN see operational service agreement fields");
    assert.equal(res.rows[0].name, "Client A Core Platform SLA");
  });

  // 4. Staff query on staff_service_agreements_view succeeds with zero financial fields
  await asUser(db, staffId, async () => {
    const res = await db.query(`SELECT * FROM public.staff_service_agreements_view;`);
    assert.equal(res.rows.length, 1);
    const row = res.rows[0];
    assert.equal(row.name, "Client A Core Platform SLA");
    assert.ok(row.billing_standing, "Billing standing must be populated");
    assert.equal(row.amount, undefined, "Amount must NOT exist on staff view");
    assert.equal(row.currency, undefined, "Currency must NOT exist on staff view");
  });

  // 5. Finance query on recurring_charges succeeds and sees amounts
  await asUser(db, financeId, async () => {
    const res = await db.query(`SELECT id, amount, currency FROM public.recurring_charges;`);
    assert.equal(res.rows.length, 1, "Finance CAN see recurring charges amounts");
    assert.equal(Number(res.rows[0].amount), 2500000);
    assert.equal(res.rows[0].currency, "UGX");
  });

  // 6. Admin query on recurring_charges succeeds
  await asUser(db, adminId, async () => {
    const res = await db.query(`SELECT id, amount FROM public.recurring_charges;`);
    assert.equal(res.rows.length, 1, "Admin CAN see recurring charges");
  });

  // 7. Client cannot access Phase 3B tables
  await asUser(db, clientAId, async () => {
    const agRes = await db.query(`SELECT * FROM public.service_agreements;`);
    assert.equal(agRes.rows.length, 0, "Client A cannot see agreements in Phase 3B");
    const rcRes = await db.query(`SELECT * FROM public.recurring_charges;`);
    assert.equal(rcRes.rows.length, 0, "Client A cannot see recurring charges");
  });
});

test("PHASE 3B: Derived Billing Standing Logic", async () => {
  const db = await createDb();
  const { adminId, clientAId } = await setupAccounts(db);

  // Create agreement with grace_days = 7, notice_days = 3
  const agA = (await db.query(`
    INSERT INTO public.service_agreements (id, client_id, name, service_type, status, start_date, default_grace_days, notice_days)
    VALUES ('77777777-7777-7777-7777-777777777777', '${clientAId}', 'Client A Standing Test', 'maintenance', 'active', '2026-01-01', 7, 3)
    RETURNING id;
  `)).rows[0].id;

  // 1. Initial state: No invoices -> CURRENT
  let standing = (await db.query(`SELECT public.derive_agreement_billing_standing('${agA}') AS s;`)).rows[0].s;
  assert.equal(standing, "CURRENT");

  // 2. Open invoice with future due date -> DUE
  const invDue = (await db.query(`
    INSERT INTO public.invoices (client_id, invoice_number, agreement_id, status, due_date, subtotal, total)
    VALUES ('${clientAId}', 'INV-ST-001', '${agA}', 'sent', CURRENT_DATE + INTERVAL '5 days', 100, 100)
    RETURNING id;
  `)).rows[0].id;

  standing = (await db.query(`SELECT public.derive_agreement_billing_standing('${agA}') AS s;`)).rows[0].s;
  assert.equal(standing, "DUE");

  // 3. Open invoice overdue by 3 days (within default_grace_days = 7) -> OVERDUE_GRACE
  await db.query(`
    UPDATE public.invoices SET due_date = CURRENT_DATE - INTERVAL '3 days', status = 'overdue'
    WHERE id = '${invDue}';
  `);
  standing = (await db.query(`SELECT public.derive_agreement_billing_standing('${agA}') AS s;`)).rows[0].s;
  assert.equal(standing, "OVERDUE_GRACE");

  // 4. Open invoice overdue by 9 days (between grace = 7 and grace+notice = 10) -> NOTICE
  await db.query(`
    UPDATE public.invoices SET due_date = CURRENT_DATE - INTERVAL '9 days'
    WHERE id = '${invDue}';
  `);
  standing = (await db.query(`SELECT public.derive_agreement_billing_standing('${agA}') AS s;`)).rows[0].s;
  assert.equal(standing, "NOTICE");

  // 5. Open invoice overdue by 12 days (> grace+notice = 10) -> SUSPENSION_ELIGIBLE
  await db.query(`
    UPDATE public.invoices SET due_date = CURRENT_DATE - INTERVAL '12 days'
    WHERE id = '${invDue}';
  `);
  standing = (await db.query(`SELECT public.derive_agreement_billing_standing('${agA}') AS s;`)).rows[0].s;
  assert.equal(standing, "SUSPENSION_ELIGIBLE");

  // 6. Cancelled invoice -> returns to CURRENT
  await db.query(`
    UPDATE public.invoices SET status = 'cancelled'
    WHERE id = '${invDue}';
  `);
  standing = (await db.query(`SELECT public.derive_agreement_billing_standing('${agA}') AS s;`)).rows[0].s;
  assert.equal(standing, "CURRENT");
});

test("PHASE 3B: Anti-Secrets Guard and Deletion Blocker on Agreements", async () => {
  const db = await createDb();
  const { adminId, clientAId } = await setupAccounts(db);

  // 1. Anti-secrets trigger rejects live API key in operational_notes
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.service_agreements (client_id, name, service_type, start_date, operational_notes)
      VALUES ('${clientAId}', 'Secret Agreement', 'managed_service', CURRENT_DATE, 'API token: sk_live_' || '0123456789abcdef0123456789');
    `),
    /violates check constraint/
  );

  // 2. Anti-secrets trigger rejects private key in contract_reference
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.service_agreements (client_id, name, service_type, start_date, contract_reference)
      VALUES ('${clientAId}', 'Key Agreement', 'managed_service', CURRENT_DATE, '-----BEGIN RSA PRIVATE KEY----- abc');
    `),
    /violates check constraint/
  );

  // 3. Normal text succeeds
  const agA = (await db.query(`
    INSERT INTO public.service_agreements (client_id, name, service_type, start_date, operational_notes)
    VALUES ('${clientAId}', 'Safe Agreement', 'managed_service', CURRENT_DATE, 'Valid non-secret SLA reference')
    RETURNING id;
  `)).rows[0].id;

  // 4. Application-level DELETE is blocked via RLS
  await asUser(db, adminId, async () => {
    const res = await db.query(`DELETE FROM public.service_agreements WHERE id = '${agA}' RETURNING *;`);
    assert.equal(res.rows.length, 0, "RLS delete policy (USING false) must block DELETE");
  });
});
