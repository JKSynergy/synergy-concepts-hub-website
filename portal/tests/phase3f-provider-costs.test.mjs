// Phase 3F: Provider Costs, Renewals & Service Margin — Unit & Invariant Tests
// Validates provider_costs schema, allocation model, same-client integrity,
// currency isolation, deterministic margin/renewal calculation, RBAC
// boundaries, staff financial anti-leak, delete safety, secret hygiene and
// audit logging. Uses PGlite in-memory Postgres.
//
// Note: 3F-REG-* regression coverage is provided by the other phase test files
// in this suite (phase3a/3b/3c/3d/3e + phase2c tests all run under npm test).

import test from "node:test";
import assert from "node:assert/strict";
import { createDb, asUser } from "./helpers/db.mjs";

const IDS = {
  provider: "11111111-1111-1111-1111-111111111111",
  account: "22222222-2222-2222-2222-222222222222",
  sysA: "33333333-3333-3333-3333-333333333333",
  resA: "44444444-4444-4444-4444-444444444441",
  resSA: "44444444-4444-4444-4444-444444444499", // client A standalone (no system)
  sysB: "55555555-5555-5555-5555-555555555555",
  resB: "66666666-6666-6666-6666-666666666661",
  agrA: "77777777-7777-7777-7777-777777777771",
  agrB: "77777777-7777-7777-7777-777777777772",
};

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

  await db.exec(`
    INSERT INTO public.providers (id, name, slug) VALUES ('${IDS.provider}', 'Vercel', 'vercel') ON CONFLICT DO NOTHING;
    INSERT INTO public.provider_accounts (id, provider_id, account_name, ownership)
    VALUES ('${IDS.account}', '${IDS.provider}', 'SCH Team', 'sch_managed') ON CONFLICT DO NOTHING;

    INSERT INTO public.systems (id, client_id, name, system_type, status)
    VALUES ('${IDS.sysA}', '${clientAId}', 'Client A System', 'web_platform', 'live') ON CONFLICT DO NOTHING;
    INSERT INTO public.resources (id, system_id, provider_account_id, name, resource_type, client_id, status)
    VALUES ('${IDS.resA}', '${IDS.sysA}', '${IDS.account}', 'Client A Web App', 'web_app', '${clientAId}', 'active') ON CONFLICT DO NOTHING;
    INSERT INTO public.resources (id, system_id, provider_account_id, name, resource_type, client_id, status)
    VALUES ('${IDS.resSA}', NULL, '${IDS.account}', 'Client A Standalone Bucket', 'storage_bucket', '${clientAId}', 'active') ON CONFLICT DO NOTHING;

    INSERT INTO public.systems (id, client_id, name, system_type, status)
    VALUES ('${IDS.sysB}', '${clientBId}', 'Client B System', 'web_platform', 'live') ON CONFLICT DO NOTHING;
    INSERT INTO public.resources (id, system_id, provider_account_id, name, resource_type, client_id, status)
    VALUES ('${IDS.resB}', '${IDS.sysB}', '${IDS.account}', 'Client B App', 'web_app', '${clientBId}', 'active') ON CONFLICT DO NOTHING;

    INSERT INTO public.service_agreements (id, client_id, system_id, name, service_type, status, start_date)
    VALUES ('${IDS.agrA}', '${clientAId}', '${IDS.sysA}', 'Client A Agreement', 'managed_service', 'active', '2026-09-01') ON CONFLICT DO NOTHING;
    INSERT INTO public.service_agreements (id, client_id, system_id, name, service_type, status, start_date)
    VALUES ('${IDS.agrB}', '${clientBId}', '${IDS.sysB}', 'Client B Agreement', 'managed_service', 'active', '2026-09-01') ON CONFLICT DO NOTHING;
  `);

  return { adminId, staffId, financeId, clientAId, clientBId };
}

async function createCost(db, { adminId, clientId = null, resourceId = "NULL", overrides = {} } = {}) {
  const cols = {
    allocation_type: clientId ? "'client'" : "'overhead'",
    client_id: clientId ? `'${clientId}'` : "NULL",
    resource_id: resourceId === "NULL" ? "NULL" : `'${resourceId}'`,
    cost_type: "'hosting'",
    description: "'Test provider cost'",
    amount: "100.00",
    currency: "'USD'",
    status: "'due'",
    created_by: `'${adminId}'`,
    ...overrides,
  };
  const res = await db.query(`
    INSERT INTO public.provider_costs (${Object.keys(cols).join(", ")})
    VALUES (${Object.values(cols).join(", ")})
    RETURNING id;
  `);
  return res.rows[0].id;
}

test("PHASE 3F: Schema validation & RLS (3F-SCHEMA-1 to 3F-SCHEMA-8)", async () => {
  const db = await createDb();
  await setupAccounts(db);

  // 3F-SCHEMA-1: provider_costs exists
  const tables = (await db.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'provider_costs';
  `)).rows;
  assert.equal(tables.length, 1, "provider_costs exists");

  // 3F-SCHEMA-2: RLS enabled
  const rls = (await db.query(`
    SELECT c.relrowsecurity FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'provider_costs';
  `)).rows[0];
  assert.equal(rls.relrowsecurity, true, "RLS enabled on provider_costs");

  // 3F-SCHEMA-3: amount is numeric money-safe type
  const amountCol = (await db.query(`
    SELECT data_type, numeric_precision, numeric_scale FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'provider_costs' AND column_name = 'amount';
  `)).rows[0];
  assert.equal(amountCol.data_type, "numeric", "amount is NUMERIC");

  // CHECK constraints
  const constraints = (await db.query(`
    SELECT pg_get_constraintdef(oid) as def FROM pg_constraint
    WHERE conrelid = 'public.provider_costs'::regclass AND contype = 'c';
  `)).rows.map(r => r.def);

  // 3F-SCHEMA-4: currency restricted to UGX/USD
  assert.ok(constraints.some(d => d.includes("'UGX'") && d.includes("'USD'")), "currency constraint exists");
  // 3F-SCHEMA-5: amount >= 0
  assert.ok(constraints.some(d => /amount\s*>=\s*\(?0/.test(d)), "amount non-negative constraint exists");
  // 3F-SCHEMA-6: billing period validity
  assert.ok(constraints.some(d => d.includes("billing_period_end") && d.includes("billing_period_start")), "billing period constraint exists");
  // 3F-SCHEMA-7: allocation_type vocabulary
  assert.ok(constraints.some(d => d.includes("'client'") && d.includes("'overhead'")), "allocation_type constraint exists");
  // 3F-SCHEMA-8: client allocation requires client_id
  assert.ok(constraints.some(d => d.includes("allocation_type") && d.includes("client_id")), "client allocation requires client_id constraint exists");

  // Negative probes
  const { adminId, clientAId } = await setupAccounts(db).catch(() => ({}));
  const admin = "00000000-0000-0000-0000-000000000001";
  await assert.rejects(() => db.query(`
    INSERT INTO public.provider_costs (allocation_type, client_id, cost_type, description, amount, currency, created_by)
    VALUES ('client', NULL, 'hosting', 'bad', 10, 'USD', '${admin}');
  `), /allocation|client_id/i, "client allocation without client_id rejected");

  await assert.rejects(() => db.query(`
    INSERT INTO public.provider_costs (allocation_type, client_id, cost_type, description, amount, currency, created_by)
    VALUES ('overhead', NULL, 'hosting', 'bad', -5, 'USD', '${admin}');
  `), /amount/i, "negative amount rejected");

  await assert.rejects(() => db.query(`
    INSERT INTO public.provider_costs (allocation_type, cost_type, description, amount, currency, created_by)
    VALUES ('overhead', 'hosting', 'bad', 5, 'EUR', '${admin}');
  `), /currency/i, "EUR currency rejected");

  await assert.rejects(() => db.query(`
    INSERT INTO public.provider_costs (allocation_type, cost_type, description, amount, currency, billing_period_start, billing_period_end, created_by)
    VALUES ('overhead', 'hosting', 'bad', 5, 'USD', '2026-10-10', '2026-10-01', '${admin}');
  `), /billing_period|chk_provider_cost_period/i, "reversed billing period rejected");
});

test("PHASE 3F: Allocation model (3F-ALLOC-1 to 3F-ALLOC-3)", async () => {
  const db = await createDb();
  const { adminId, clientAId } = await setupAccounts(db);

  // 3F-ALLOC-1: client allocation requires client
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.provider_costs (allocation_type, client_id, cost_type, description, amount, currency, created_by)
      VALUES ('client', NULL, 'hosting', 'Client cost', 100, 'USD', '${adminId}');
    `)
  );

  // 3F-ALLOC-2: overhead allocation can exist without client
  const overhead = await createCost(db, { adminId, clientId: null });
  assert.ok(overhead, "overhead cost without client allowed");

  // Overhead cost bound to a client-owned resource is rejected
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.provider_costs (allocation_type, client_id, resource_id, cost_type, description, amount, currency, created_by)
      VALUES ('overhead', NULL, '${IDS.resA}', 'hosting', 'Bad overhead', 50, 'USD', '${adminId}');
    `),
    /overhead/i
  );

  // 3F-ALLOC-3: explicit cross-client binding rejected (Client A cost on Client B resource)
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.provider_costs (allocation_type, client_id, resource_id, cost_type, description, amount, currency, created_by)
      VALUES ('client', '${clientAId}', '${IDS.resB}', 'hosting', 'Cross client', 50, 'USD', '${adminId}');
    `),
    /does not match referenced resource client_id/i
  );

  // client_id derived automatically from the resource's ownership
  const derived = (await db.query(`
    INSERT INTO public.provider_costs (allocation_type, resource_id, cost_type, description, amount, currency, created_by)
    VALUES ('client', '${IDS.resA}', 'hosting', 'Derived client cost', 60, 'USD', '${adminId}')
    RETURNING client_id, system_id, provider_account_id;
  `)).rows[0];
  assert.equal(derived.client_id, clientAId, "client_id resolved from resource");
  assert.equal(derived.system_id, IDS.sysA, "system_id derived from resource");
  assert.equal(derived.provider_account_id, IDS.account, "provider_account_id derived from resource");
});

test("PHASE 3F: Same-client integrity (3F-INT-1 to 3F-INT-4)", async () => {
  const db = await createDb();
  const { adminId, clientAId } = await setupAccounts(db);

  // 3F-INT-1: Client A cost cannot reference Client B resource
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.provider_costs (allocation_type, client_id, resource_id, cost_type, description, amount, currency, created_by)
      VALUES ('client', '${clientAId}', '${IDS.resB}', 'hosting', 'x', 10, 'USD', '${adminId}');
    `),
    /does not match referenced resource client_id/i
  );

  // 3F-INT-2: Client A cost cannot reference Client B system
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.provider_costs (allocation_type, client_id, resource_id, system_id, cost_type, description, amount, currency, created_by)
      VALUES ('client', '${clientAId}', '${IDS.resSA}', '${IDS.sysB}', 'hosting', 'x', 10, 'USD', '${adminId}');
    `),
    /does not match referenced system client_id/i
  );

  // 3F-INT-3: Client A cost cannot reference Client B agreement
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.provider_costs (allocation_type, client_id, service_agreement_id, cost_type, description, amount, currency, created_by)
      VALUES ('client', '${clientAId}', '${IDS.agrB}', 'hosting', 'x', 10, 'USD', '${adminId}');
    `),
    /does not match referenced service agreement client_id/i
  );

  // 3F-INT-4: resource/provider_account and resource/system consistency enforced
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.provider_costs (allocation_type, client_id, resource_id, system_id, cost_type, description, amount, currency, created_by)
      VALUES ('client', '${clientAId}', '${IDS.resA}', '${IDS.sysB}', 'hosting', 'x', 10, 'USD', '${adminId}');
    `),
    /does not match the referenced resource system/i
  );

  // Overhead on client-owned resource rejected
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.provider_costs (allocation_type, resource_id, cost_type, description, amount, currency, created_by)
      VALUES ('overhead', '${IDS.resA}', 'hosting', 'x', 10, 'USD', '${adminId}');
    `),
    /overhead/i
  );
});

test("PHASE 3F: Lifecycle & bindings", async () => {
  const db = await createDb();
  const { adminId, clientAId } = await setupAccounts(db);

  const costId = await createCost(db, { adminId, clientId: clientAId, resourceId: IDS.resA });

  // paid transition populates paid_at
  await db.query(`UPDATE public.provider_costs SET status = 'paid' WHERE id = '${costId}';`);
  let cur = (await db.query(`SELECT status, paid_at FROM public.provider_costs WHERE id = '${costId}';`)).rows[0];
  assert.equal(cur.status, "paid");
  assert.ok(cur.paid_at, "paid_at populated on paid transition");

  // cancelled is terminal
  await db.query(`UPDATE public.provider_costs SET status = 'cancelled' WHERE id = '${costId}';`);
  await assert.rejects(
    () => db.query(`UPDATE public.provider_costs SET status = 'due' WHERE id = '${costId}';`),
    /cannot be reactivated/i
  );

  // client/resource bindings immutable
  const cost2 = await createCost(db, { adminId, clientId: clientAId, resourceId: IDS.resA });
  await assert.rejects(
    () => db.query(`UPDATE public.provider_costs SET resource_id = '${IDS.resSA}' WHERE id = '${cost2}';`),
    /bindings cannot be changed/i
  );

  // new record cannot be created cancelled
  await assert.rejects(
    () => db.query(`
      INSERT INTO public.provider_costs (allocation_type, client_id, resource_id, cost_type, description, amount, currency, status, created_by)
      VALUES ('client', '${clientAId}', '${IDS.resA}', 'hosting', 'x', 10, 'USD', 'cancelled', '${adminId}');
    `),
    /cannot be created as cancelled/i
  );
});

test("PHASE 3F: Currency isolation & service margin (3F-CURRENCY-1 to 3, 3F-MARGIN-1 to 3)", async () => {
  const db = await createDb();
  const { adminId, clientAId } = await setupAccounts(db);

  // Revenue source: active recurring charge in USD on agreement A
  await db.exec(`
    INSERT INTO public.recurring_charges (id, agreement_id, name, amount, currency, billing_cycle, active, start_date)
    VALUES ('88888888-8888-8888-8888-888888888881', '${IDS.agrA}', 'Managed Hosting Fee', 200.00, 'USD', 'monthly', true, '2026-09-01')
    ON CONFLICT DO NOTHING;
    INSERT INTO public.recurring_charges (id, agreement_id, name, amount, currency, billing_cycle, active, start_date)
    VALUES ('88888888-8888-8888-8888-888888888882', '${IDS.agrA}', 'UGX Support Fee', 500000.00, 'UGX', 'monthly', true, '2026-09-01')
    ON CONFLICT DO NOTHING;
  `);

  // Allocated USD provider cost on agreement A
  await createCost(db, {
    adminId, clientId: clientAId, resourceId: IDS.resA,
    overrides: { service_agreement_id: `'${IDS.agrA}'`, amount: "60.00", currency: "'USD'" },
  });

  // Query margins as admin (view role guard)
  let rows;
  await asUser(db, adminId, async () => {
    rows = (await db.query(`
      SELECT currency, service_revenue, allocated_cost, margin_amount, margin_pct, margin_state
      FROM public.service_margin_view WHERE agreement_id = '${IDS.agrA}' ORDER BY currency;
    `)).rows;
  });

  const ugx = rows.find(r => r.currency === "UGX");
  const usd = rows.find(r => r.currency === "USD");
  assert.ok(ugx, "UGX margin row exists");
  assert.ok(usd, "USD margin row exists");

  // 3F-CURRENCY-2 / 3F-MARGIN-1/2: USD margin = 200 - 60 = 140, pct = 70%
  assert.equal(Number(usd.service_revenue), 200);
  assert.equal(Number(usd.allocated_cost), 60);
  assert.equal(Number(usd.margin_amount), 140);
  assert.equal(Number(usd.margin_pct), 70);
  assert.equal(usd.margin_state, "computed");

  // 3F-CURRENCY-1: UGX revenue with no UGX cost -> margin = full revenue
  assert.equal(Number(ugx.service_revenue), 500000);
  assert.equal(Number(ugx.allocated_cost), 0);
  assert.equal(Number(ugx.margin_amount), 500000);

  // 3F-CURRENCY-3: the USD cost was NOT applied to the UGX row (no mixing)
  assert.notEqual(Number(ugx.allocated_cost), 60, "USD cost never applied to UGX margin");

  // 3F-MARGIN-3: agreement B has a cost but no revenue -> margin unavailable
  await createCost(db, {
    adminId, clientId: null, resourceId: IDS.resB,
    overrides: { allocation_type: "'client'", service_agreement_id: `'${IDS.agrB}'`, amount: "25.00", currency: "'USD'" },
  });
  // resB is client B — cost's client resolves to clientB automatically
  await asUser(db, adminId, async () => {
    const r = (await db.query(`
      SELECT margin_amount, margin_state FROM public.service_margin_view
      WHERE agreement_id = '${IDS.agrB}' AND currency = 'USD';
    `)).rows[0];
    assert.ok(r, "cost-only agreement produces a margin row");
    assert.equal(r.margin_amount, null, "margin unavailable without revenue");
    assert.equal(r.margin_state, "unavailable");
  });
});

test("PHASE 3F: Renewal classification (3F-RENEWAL-1 to 3F-RENEWAL-3)", async () => {
  const db = await createDb();
  const { adminId, clientAId } = await setupAccounts(db);

  const state = async (expr) =>
    (await db.query(`SELECT public.derive_cost_renewal_state(${expr}) AS s;`)).rows[0].s;

  // no_renewal: non-recurring or missing date or cancelled
  assert.equal(await state("NULL, true, 'due'"), "no_renewal");
  assert.equal(await state("CURRENT_DATE + 30, false, 'due'"), "no_renewal");
  assert.equal(await state("CURRENT_DATE + 30, true, 'cancelled'"), "no_renewal");

  // 3F-RENEWAL-3: overdue
  assert.equal(await state("CURRENT_DATE - 1, true, 'due'"), "overdue");

  // 3F-RENEWAL-2: due within 7 days (operational default threshold)
  assert.equal(await state("CURRENT_DATE, true, 'due'"), "due");
  assert.equal(await state("CURRENT_DATE + 7, true, 'due'"), "due");

  // 3F-RENEWAL-1: upcoming
  assert.equal(await state("CURRENT_DATE + 8, true, 'due'"), "upcoming");
  assert.equal(await state("CURRENT_DATE + 90, true, 'due'"), "upcoming");

  // Column-level check through the finance overview view
  const costId = await createCost(db, {
    adminId, clientId: clientAId, resourceId: IDS.resA,
    overrides: { is_recurring: "true", renewal_date: "CURRENT_DATE + 3" },
  });
  await asUser(db, adminId, async () => {
    const r = (await db.query(`
      SELECT renewal_state FROM public.provider_cost_overview WHERE id = '${costId}';
    `)).rows[0];
    assert.equal(r.renewal_state, "due");
  });
});

test("PHASE 3F: RBAC & staff financial anti-leak (3F-RBAC-1 to 3F-RBAC-4)", async () => {
  const db = await createDb();
  const { adminId, staffId, financeId, clientAId } = await setupAccounts(db);

  const costId = await createCost(db, { adminId, clientId: clientAId, resourceId: IDS.resA });

  // 3F-RBAC-1: Admin full management
  await asUser(db, adminId, async () => {
    const rows = (await db.query(`SELECT id, amount FROM public.provider_costs WHERE id = '${costId}';`)).rows;
    assert.equal(rows.length, 1, "admin reads provider_costs");
    await db.query(`UPDATE public.provider_costs SET status = 'paid' WHERE id = '${costId}';`);
  });

  // 3F-RBAC-2: Finance full financial access
  await asUser(db, financeId, async () => {
    const rows = (await db.query(`SELECT id, amount, currency FROM public.provider_costs WHERE id = '${costId}';`)).rows;
    assert.equal(rows.length, 1, "finance reads provider_costs with amounts");
    const created = (await db.query(`
      INSERT INTO public.provider_costs (allocation_type, client_id, cost_type, description, amount, currency, created_by)
      VALUES ('client', '${clientAId}', 'domain', 'Finance-created domain renewal', 15, 'USD', '${financeId}')
      RETURNING id;
    `)).rows[0];
    assert.ok(created, "finance can create provider costs");
    // Finance sees margin view
    const margin = (await db.query(`SELECT agreement_id FROM public.service_margin_view LIMIT 1;`)).rows;
    assert.ok(Array.isArray(margin), "finance reads service_margin_view");
  });

  // 3F-RBAC-3: Staff cannot access financial amounts
  await asUser(db, staffId, async () => {
    const rows = (await db.query(`SELECT * FROM public.provider_costs;`)).rows;
    assert.equal(rows.length, 0, "staff sees 0 rows on raw provider_costs");
    // Staff safe view returns rows but has NO financial columns
    const safe = (await db.query(`SELECT * FROM public.staff_provider_costs_view;`)).rows;
    assert.ok(safe.length >= 1, "staff sees operational context via safe view");
    const keys = Object.keys(safe[0]);
    for (const forbidden of ["amount", "currency", "margin_amount", "margin_pct", "service_revenue", "allocated_cost", "notes", "description"]) {
      assert.ok(!keys.includes(forbidden), `staff view must not expose ${forbidden}`);
    }
    // Staff cannot write costs (RLS + trigger)
    await assert.rejects(() => db.query(`
      INSERT INTO public.provider_costs (allocation_type, client_id, cost_type, description, amount, currency, created_by)
      VALUES ('client', '${clientAId}', 'hosting', 'staff attempt', 5, 'USD', '${staffId}');
    `));
    // Staff sees no margin data
    const margins = (await db.query(`SELECT * FROM public.service_margin_view;`)).rows;
    assert.equal(margins.length, 0, "staff sees 0 margin rows");
    // Finance overview guarded too
    const overview = (await db.query(`SELECT * FROM public.provider_cost_overview;`)).rows;
    assert.equal(overview.length, 0, "staff sees 0 finance overview rows");
  });

  // 3F-RBAC-4: Client cannot access costs at all
  await asUser(db, clientAId, async () => {
    const raw = (await db.query(`SELECT * FROM public.provider_costs;`)).rows;
    assert.equal(raw.length, 0, "client sees 0 raw cost rows");
    const safe = (await db.query(`SELECT * FROM public.staff_provider_costs_view;`)).rows;
    assert.equal(safe.length, 0, "client sees 0 staff view rows");
    const margins = (await db.query(`SELECT * FROM public.service_margin_view;`)).rows;
    assert.equal(margins.length, 0, "client sees 0 margin rows");
    const overview = (await db.query(`SELECT * FROM public.provider_cost_overview;`)).rows;
    assert.equal(overview.length, 0, "client sees 0 overview rows");
  });
});

test("PHASE 3F: Audit logging (3F-AUDIT-1 to 3F-AUDIT-4)", async () => {
  const db = await createDb();
  const { adminId, clientAId } = await setupAccounts(db);

  const costId = await createCost(db, { adminId, clientId: clientAId, resourceId: IDS.resA });

  const logs = async () =>
    (await db.query(`SELECT action FROM public.audit_logs WHERE table_name = 'provider_costs' AND record_id = '${costId}';`)).rows.map(r => r.action);

  // 3F-AUDIT-1: creation audited
  assert.ok((await logs()).includes("provider_cost.created"), "provider_cost.created logged");

  // 3F-AUDIT-2: update audited
  await db.query(`UPDATE public.provider_costs SET description = 'Updated description' WHERE id = '${costId}';`);
  assert.ok((await logs()).includes("provider_cost.updated"), "provider_cost.updated logged");

  // 3F-AUDIT-3: status change audited (+ cancelled)
  await db.query(`UPDATE public.provider_costs SET status = 'paid' WHERE id = '${costId}';`);
  assert.ok((await logs()).includes("provider_cost.status_changed"), "provider_cost.status_changed logged");

  // 3F-AUDIT-4: renewal change audited
  await db.query(`UPDATE public.provider_costs SET renewal_date = CURRENT_DATE + 30, is_recurring = true WHERE id = '${costId}';`);
  assert.ok((await logs()).includes("provider_cost.renewal_updated"), "provider_cost.renewal_updated logged");

  // cancel audited
  await db.query(`UPDATE public.provider_costs SET status = 'cancelled' WHERE id = '${costId}';`);
  const l = await logs();
  assert.ok(l.includes("provider_cost.cancelled"), "provider_cost.cancelled logged");
});

test("PHASE 3F: Security — delete safety, view hygiene, no secrets (3F-SEC-1 to 3F-SEC-5)", async () => {
  const db = await createDb();
  const { adminId, clientAId } = await setupAccounts(db);
  const costId = await createCost(db, { adminId, clientId: clientAId, resourceId: IDS.resA });

  // 3F-SEC-3: destructive deletion blocked
  await assert.rejects(
    () => db.query(`DELETE FROM public.provider_costs WHERE id = '${costId}';`),
    /Destructive deletion of provider cost records is strictly forbidden/i
  );

  // 3F-SEC-4: staff safe view exposes no financial columns
  const safeCols = (await db.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'staff_provider_costs_view';
  `)).rows.map(r => r.column_name);
  for (const forbidden of ["amount", "currency", "margin", "revenue", "paid_at", "description", "notes", "renewal_notes"]) {
    assert.ok(!safeCols.some(c => c.includes(forbidden)), `staff view must not contain '${forbidden}' column`);
  }

  // 3F-SEC-5: no credential/secret fields on provider_costs
  const cols = (await db.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'provider_costs';
  `)).rows.map(r => r.column_name);
  const forbidden = cols.filter(c => /password|secret|token|api_key|apikey|private_key|credential/i.test(c));
  assert.deepEqual(forbidden, [], `no secret columns; found ${JSON.stringify(forbidden)}`);

  // Secret-shaped notes rejected by anti-secrets guard
  await assert.rejects(() => db.query(`
    INSERT INTO public.provider_costs (allocation_type, client_id, cost_type, description, amount, currency, notes, created_by)
    VALUES ('client', '${clientAId}', 'hosting', 'ok', 10, 'USD', 'api_key = "sk_live_abcdef123456"', '${adminId}');
  `));

  // 3F-SEC-1/2: anon zero privileges + no TRUNCATE — grant-level checks run in
  // the hosted verifier against real roles (PGlite grants differ in-harness).
  const t = (await db.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'provider_costs';
  `)).rows;
  assert.equal(t.length, 1);
});
