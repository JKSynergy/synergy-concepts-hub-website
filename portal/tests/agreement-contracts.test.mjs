// Agreements as contracts (migration 038): contract terms, discount lines,
// billing periods, one invoice per period, previews. PGlite harness.
import test from "node:test";
import assert from "node:assert/strict";
import { createDb, asUser } from "./helpers/db.mjs";

const ADMIN = "00000000-0000-0000-0000-0000000000a1";
const STAFF = "00000000-0000-0000-0000-0000000000a2";
const FIN = "00000000-0000-0000-0000-0000000000a3";
const ELGON = "00000000-0000-0000-0000-0000000000c1";
const SOLVERS = "00000000-0000-0000-0000-0000000000c2";
const SYS_E = "11111111-0000-0000-0000-000000000001";
const AGR = "22222222-0000-0000-0000-000000000001";
const CHG = "33333333-0000-0000-0000-000000000001";

async function setup({ status = "active", start = "2026-10-01", cycle = "monthly", amount = 1000000, end = null } = {}) {
  const db = await createDb();
  for (const [id, email, role] of [
    [ADMIN, "admin@sch.test", "admin"],
    [STAFF, "staff@sch.test", "staff"],
    [FIN, "fin@sch.test", "finance"],
    [ELGON, "elgon@client.test", "client"],
    [SOLVERS, "solvers@client.test", "client"],
  ]) {
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${id}', '${email}');
      INSERT INTO public.profiles (id, email, role) VALUES ('${id}', '${email}', '${role}')
        ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;`);
  }
  await db.exec(`
    INSERT INTO public.systems (id, client_id, name, system_type, status) VALUES
      ('${SYS_E}', '${ELGON}', 'Elgon Operations', 'web_platform', 'live');
    INSERT INTO public.service_agreements (id, client_id, system_id, name, service_type, status, start_date, billing_cycle,
                                           contract_reference)
      VALUES ('${AGR}', '${ELGON}', '${SYS_E}', 'Managed System Care', 'managed_service', '${status}', '${start}', '${cycle}',
              'EBC-MSC-2026');
    INSERT INTO public.recurring_charges (id, agreement_id, name, amount, currency, billing_cycle, start_date, end_date)
      VALUES ('${CHG}', '${AGR}', 'Managed System Care', ${amount}, 'UGX', '${cycle}', '${start}', ${end ? `'${end}'` : "NULL"});`);
  return db;
}

const json = (v) => JSON.stringify(v).replace(/'/g, "''");
const one = async (db, sql) => (await db.query(sql)).rows[0];

test("seed packages: Managed System Care (UGX 1,000,000) and Hosting Starter (USD 30) with scope and targets", async () => {
  const db = await setup();
  const rows = (await db.query(`
    SELECT p.name, p.currency, p.annual_discount, jsonb_array_length(p.response_targets) targets,
           p.scope_excluded IS NOT NULL has_excl, SUM(ROUND(i.quantity * i.unit_price, 2)) total
    FROM public.service_packages p JOIN public.service_package_items i ON i.package_id = p.id
    GROUP BY p.id ORDER BY p.name`)).rows;
  assert.deepEqual(rows.map((r) => [r.name, r.currency, Number(r.total)]), [
    ["Hosting Starter", "USD", 30],
    ["Managed System Care", "UGX", 1000000],
  ]);
  const msc = rows.find((r) => r.name === "Managed System Care");
  assert.equal(Number(msc.annual_discount), 1700000);
  assert.equal(msc.targets, 4);
  assert.ok(msc.has_excl);
});

test("discount lines: annual plan = 12 months less the commitment discount; totals cannot go negative", async () => {
  const db = await setup({ cycle: "annual", amount: 10300000 });
  const lines = [
    { section: "Maintenance", description: "Managed maintenance & support", quantity: 12, unit: "months", unit_price: 750000 },
    { section: "Hosting", description: "Managed hosting & database", quantity: 12, unit: "months", unit_price: 250000 },
    { description: "Annual commitment discount", quantity: 1, unit_price: -1700000 },
  ];
  const total = await asUser(db, FIN, () => one(db, `SELECT public.replace_recurring_charge_items('${CHG}', '${json(lines)}'::jsonb) t`));
  assert.equal(Number(total.t), 10300000);
  const kinds = (await db.query(`SELECT kind, unit_price FROM public.recurring_charge_items ORDER BY position`)).rows;
  assert.deepEqual(kinds.map((k) => k.kind), ["charge", "charge", "discount"]);

  // A discount cannot be stored as a charge, nor a charge with a negative price.
  await assert.rejects(
    db.query(`INSERT INTO public.recurring_charge_items (recurring_charge_id, description, quantity, unit_price, kind)
              VALUES ('${CHG}', 'Bad', 1, -5, 'charge')`),
    /recurring_charge_items_kind_price/,
  );
  // Package discounts larger than the package are refused.
  const pkg = await one(db, `SELECT id FROM public.service_packages WHERE name = 'Hosting Starter'`);
  await assert.rejects(
    asUser(db, FIN, () => db.query(`SELECT public.replace_service_package_items('${pkg.id}', '${json([
      { description: "Hosting", quantity: 1, unit_price: 10 },
      { description: "Discount", quantity: 1, unit_price: -20 },
    ])}'::jsonb)`)),
    /cannot exceed the package total/,
  );
});

test("contract terms: Admin/Finance only; sent stamps the time; acceptance needs who and when", async () => {
  const db = await setup({ status: "draft" });
  await assert.rejects(
    asUser(db, STAFF, () => db.query(`UPDATE public.service_agreements SET scope_excluded = 'x' WHERE id = '${AGR}'`)),
    /Only Admin or Finance can change agreement terms/,
  );
  await assert.rejects(
    asUser(db, STAFF, () => db.query(`UPDATE public.service_agreements SET status = 'sent' WHERE id = '${AGR}'`)),
    /Only Admin or Finance/,
  );
  // Operational notes stay editable by staff.
  await asUser(db, STAFF, () => db.query(`UPDATE public.service_agreements SET operational_notes = 'Depot 2 uses tablets' WHERE id = '${AGR}'`));

  await asUser(db, FIN, () => db.query(`UPDATE public.service_agreements SET status = 'sent' WHERE id = '${AGR}'`));
  assert.ok((await one(db, `SELECT sent_at FROM public.service_agreements WHERE id = '${AGR}'`)).sent_at);

  await assert.rejects(
    asUser(db, FIN, () => db.query(`UPDATE public.service_agreements SET status = 'accepted' WHERE id = '${AGR}'`)),
    /Record who accepted/,
  );
  await assert.rejects(
    asUser(db, FIN, () => db.query(`UPDATE public.service_agreements SET status = 'accepted', accepted_by_name = 'A. Manager',
      accepted_at = now() + interval '2 days' WHERE id = '${AGR}'`)),
    /cannot be in the future/,
  );
  await asUser(db, FIN, () => db.query(`UPDATE public.service_agreements SET status = 'accepted', accepted_by_name = 'A. Manager',
    accepted_by_title = 'General Manager', accepted_at = now() - interval '1 hour' WHERE id = '${AGR}'`));
  assert.equal((await one(db, `SELECT billing_standing FROM public.staff_service_agreements_view WHERE id = '${AGR}'`)).billing_standing, "PROPOSAL");

  // Signed document must live under the agreement's own folder.
  await assert.rejects(
    asUser(db, FIN, () => db.query(`UPDATE public.service_agreements SET signed_document_path = '${CHG}/signed.pdf' WHERE id = '${AGR}'`)),
    /stored under this agreement/,
  );
  await asUser(db, FIN, () => db.query(`UPDATE public.service_agreements SET signed_document_path = '${AGR}/signed.pdf',
    signed_document_name = 'Elgon signed.pdf' WHERE id = '${AGR}'`));

  // Invalid response targets are refused.
  await assert.rejects(
    asUser(db, FIN, () => db.query(`UPDATE public.service_agreements SET response_targets = '[{"priority":"urgent","target":"now"}]' WHERE id = '${AGR}'`)),
    /service_agreements_contract_valid/,
  );
});

test("billing periods are anchored at the start date", async () => {
  const db = await setup({ start: "2026-01-31" });
  const p = async (d) => one(db, `SELECT period_start::text s, period_end::text e FROM public.agreement_charge_period('${CHG}', '${d}')`);
  assert.deepEqual(await p("2026-01-31"), { s: "2026-01-31", e: "2026-02-27" });
  assert.deepEqual(await p("2026-02-28"), { s: "2026-02-28", e: "2026-03-30" });
  await assert.rejects(p("2026-02-15"), /not the start of a billing period/);
  await assert.rejects(p("2025-12-31"), /not the start of a billing period/);

  const db2 = await setup({ start: "2026-10-01", end: "2027-03-15" });
  const p2 = async (d) => one(db2, `SELECT period_start::text s, period_end::text e FROM public.agreement_charge_period('${CHG}', '${d}')`);
  assert.deepEqual(await p2("2026-10-01"), { s: "2026-10-01", e: "2026-10-31" });
  assert.deepEqual(await p2("2027-03-01"), { s: "2027-03-01", e: "2027-03-15" });
  await assert.rejects(p2("2027-04-01"), /The charge ended/);
});

test("bill_agreement_period: one itemised invoice per period, optionally issued; Finance only", async () => {
  const db = await setup();
  await asUser(db, FIN, () => db.query(`SELECT public.replace_recurring_charge_items('${CHG}', '${json([
    { section: "Maintenance", description: "Health checks", quantity: 4, unit: "checks", unit_price: 50000 },
    { section: "Maintenance", description: "Support", quantity: 1, unit: "month", unit_price: 550000 },
    { section: "Hosting", description: "Hosting & database", quantity: 1, unit: "month", unit_price: 250000 },
  ])}'::jsonb)`));

  await assert.rejects(
    asUser(db, STAFF, () => db.query(`SELECT public.bill_agreement_period('${CHG}', '2026-10-01')`)),
    /Admin or Finance access required/,
  );
  await assert.rejects(
    asUser(db, FIN, () => db.query(`SELECT public.bill_agreement_period('${CHG}', '2026-10-02')`)),
    /not the start of a billing period/,
  );
  await assert.rejects(
    asUser(db, FIN, () => db.query(`SELECT public.bill_agreement_period('${CHG}', '2030-01-01')`)),
    /too far ahead/,
  );

  const inv = (await asUser(db, FIN, () => one(db, `SELECT public.bill_agreement_period('${CHG}', '2026-10-01') id`))).id;
  const head = await one(db, `SELECT status, total, document_style, agreement_id, recurring_charge_id,
    service_period_start::text s, service_period_end::text e, due_date - issue_date AS due_days, notes
    FROM public.invoices WHERE id = '${inv}'`);
  assert.equal(head.status, "draft");
  assert.equal(Number(head.total), 1000000);
  assert.equal(head.document_style, "service");
  assert.equal(head.agreement_id, AGR);
  assert.equal(head.s, "2026-10-01");
  assert.equal(head.e, "2026-10-31");
  assert.equal(head.due_days, 14);
  assert.match(head.notes, /EBC-MSC-2026/);
  const lines = (await db.query(`SELECT section, description, amount, period_start::text ps FROM public.invoice_line_items
    WHERE invoice_id = '${inv}' ORDER BY position`)).rows;
  assert.equal(lines.length, 3);
  assert.equal(lines[0].ps, "2026-10-01");

  // Once per period.
  await assert.rejects(
    asUser(db, FIN, () => db.query(`SELECT public.bill_agreement_period('${CHG}', '2026-10-01')`)),
    /already invoiced/,
  );

  // Send in one step.
  const sent = (await asUser(db, FIN, () => one(db, `SELECT public.bill_agreement_period('${CHG}', '2026-11-01', true) id`))).id;
  assert.equal((await one(db, `SELECT status FROM public.invoices WHERE id = '${sent}'`)).status, "sent");
  assert.equal((await one(db, `SELECT count(*)::int n FROM public.recurring_charge_runs`)).n, 2);

  // A proposal is not billed.
  await db.exec(`UPDATE public.service_agreements SET status = 'draft' WHERE id = '${AGR}'`);
  await assert.rejects(
    asUser(db, FIN, () => db.query(`SELECT public.bill_agreement_period('${CHG}', '2026-12-01')`)),
    /only an active agreement is billed/,
  );
});

test("annual invoice carries the discount line and totals 10,300,000", async () => {
  const db = await setup({ cycle: "annual", amount: 10300000 });
  await asUser(db, FIN, () => db.query(`SELECT public.replace_recurring_charge_items('${CHG}', '${json([
    { description: "Managed maintenance & support", quantity: 12, unit: "months", unit_price: 750000 },
    { description: "Managed hosting & database", quantity: 12, unit: "months", unit_price: 250000 },
    { description: "Annual commitment discount", quantity: 1, unit_price: -1700000 },
  ])}'::jsonb)`));
  const inv = (await asUser(db, FIN, () => one(db, `SELECT public.bill_agreement_period('${CHG}', '2026-10-01') id`))).id;
  const head = await one(db, `SELECT total, subtotal, service_period_end::text e FROM public.invoices WHERE id = '${inv}'`);
  assert.equal(Number(head.total), 10300000);
  assert.equal(head.e, "2027-09-30");
  const disc = await one(db, `SELECT kind, amount FROM public.invoice_line_items WHERE invoice_id = '${inv}' AND kind = 'discount'`);
  assert.equal(Number(disc.amount), -1700000);
});

test("service record: preview is Finance-only; invoices carry the agreement's targets and exclusions", async () => {
  const db = await setup();
  await asUser(db, FIN, () => db.query(`UPDATE public.service_agreements SET
    response_targets = '[{"priority":"critical","target":"Within 2 business hours","hours":2}]',
    scope_excluded = E'New modules\\nHardware' WHERE id = '${AGR}'`));
  await assert.rejects(
    asUser(db, STAFF, () => db.query(`SELECT public.agreement_period_record('${AGR}', '2026-10-01', '2026-10-31')`)),
    /Admin or Finance access required/,
  );
  const prev = await asUser(db, FIN, () => one(db, `SELECT public.agreement_period_record('${AGR}', '2026-10-01', '2026-10-31') r`));
  assert.equal(prev.r.agreement.response_targets[0].hours, 2);
  assert.deepEqual(prev.r.requests, []);

  const inv = (await asUser(db, FIN, () => one(db, `SELECT public.bill_agreement_period('${CHG}', '2026-10-01', true) id`))).id;
  const rec = await asUser(db, ELGON, () => one(db, `SELECT public.invoice_service_record('${inv}') r`));
  assert.equal(rec.r.agreement.contract_reference, "EBC-MSC-2026");
  assert.match(rec.r.agreement.scope_excluded, /Hardware/);
  // Another client sees nothing.
  const other = await asUser(db, SOLVERS, () => one(db, `SELECT public.invoice_service_record('${inv}') r`));
  assert.equal(other.r, null);
});

test("create_agreement_from_package: monthly, annual (×12 less discount) and custom amounts", async () => {
  const db = await setup();
  const pkg = (await one(db, `SELECT id FROM public.service_packages WHERE name = 'Managed System Care'`)).id;
  const mk = (plan, extra = "") => asUser(db, FIN, () => one(db, `SELECT public.create_agreement_from_package(
      p_client_id => '${ELGON}', p_name => 'Managed System Care', p_start_date => '2026-10-01', p_plan => '${plan}',
      p_package_id => '${pkg}', p_system_id => '${SYS_E}', p_status => 'active' ${extra}) id`));

  const monthly = (await mk("monthly")).id;
  const m = await one(db, `SELECT c.amount, c.currency, c.billing_cycle, a.service_type, a.scope_excluded IS NOT NULL excl,
      jsonb_array_length(a.response_targets) t, (SELECT count(*)::int FROM public.recurring_charge_items i WHERE i.recurring_charge_id = c.id) n
    FROM public.service_agreements a JOIN public.recurring_charges c ON c.agreement_id = a.id WHERE a.id = '${monthly}'`);
  assert.equal(Number(m.amount), 1000000);
  assert.equal(m.billing_cycle, "monthly");
  assert.equal(m.n, 9);
  assert.equal(m.t, 4);
  assert.ok(m.excl);

  const annual = (await mk("annual")).id;
  const a = await one(db, `SELECT c.id, c.amount, c.billing_cycle FROM public.recurring_charges c WHERE c.agreement_id = '${annual}'`);
  assert.equal(Number(a.amount), 10300000);
  assert.equal(a.billing_cycle, "annual");
  const lines = (await db.query(`SELECT description, quantity, unit, unit_price, kind FROM public.recurring_charge_items
    WHERE recurring_charge_id = '${a.id}' ORDER BY position`)).rows;
  assert.equal(Number(lines[0].quantity), 48); // 4 checks × 12
  assert.equal(lines[1].unit, "months");
  assert.deepEqual([lines.at(-1).description, Number(lines.at(-1).unit_price), lines.at(-1).kind],
    ["Annual commitment discount", -1700000, "discount"]);

  // Its first annual invoice: Oct 2026 – Sep 2027, 10,300,000.
  const inv = (await asUser(db, FIN, () => one(db, `SELECT public.bill_agreement_period('${a.id}', '2026-10-01') id`))).id;
  assert.equal(Number((await one(db, `SELECT total FROM public.invoices WHERE id = '${inv}'`)).total), 10300000);

  const custom = (await asUser(db, FIN, () => one(db, `SELECT public.create_agreement_from_package(
      p_client_id => '${SOLVERS}', p_name => 'Website hosting', p_start_date => '2026-11-01',
      p_amount => 30, p_currency => 'USD') id`))).id;
  const c = await one(db, `SELECT a.status, a.service_type, c.amount, c.currency FROM public.service_agreements a
    JOIN public.recurring_charges c ON c.agreement_id = a.id WHERE a.id = '${custom}'`);
  assert.deepEqual([c.status, c.service_type, Number(c.amount), c.currency], ["draft", "custom", 30, "USD"]);

  await assert.rejects(
    asUser(db, STAFF, () => db.query(`SELECT public.create_agreement_from_package('${ELGON}', 'X', '2026-10-01')`)),
    /Admin or Finance access required/,
  );
  // A system of another client is refused.
  await assert.rejects(
    asUser(db, FIN, () => db.query(`SELECT public.create_agreement_from_package(p_client_id => '${SOLVERS}', p_name => 'X',
      p_start_date => '2026-10-01', p_package_id => '${pkg}', p_system_id => '${SYS_E}')`)),
    /system must belong/,
  );
});
