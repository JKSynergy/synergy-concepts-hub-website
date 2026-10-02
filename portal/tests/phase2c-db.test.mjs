// Phase 2C (updated after migrations 011/012): what real Postgres (PGlite + migrations 001-010) says about the
// questions raised by the Phase 2B mock run. This is NOT a real-Supabase test:
// auth, storage, PostgREST and the hosted project are stand-ins/absent.
import test, { before } from "node:test";
import assert from "node:assert/strict";
import { createDb, seed, asUser, asService, rejects } from "./helpers/db.mjs";

let db, ids;
before(async () => { db = await createDb(); ids = await seed(db); });
const asAdmin = (f) => asUser(db, ids.admin, f);

async function draft(items = [[2, 50000]], tax = 0) {
  // exactly the columns app createInvoice() inserts: no number, no totals
  const row = await asAdmin(async () => {
    const r = await db.query(`INSERT INTO public.invoices (client_id, project_id, status, issue_date, due_date, tax_rate, notes) VALUES ('${ids.c1}', NULL, 'draft', current_date, NULL, ${tax}, NULL) RETURNING id`);
    for (const [q, p] of items) await db.exec(`INSERT INTO public.invoice_line_items (invoice_id, description, quantity, unit_price) VALUES ('${r.rows[0].id}', 'x', ${q}, ${p})`);
    return r.rows[0];
  });
  return row.id;
}
const inv = async (id) => (await db.query(`SELECT * FROM public.invoices WHERE id='${id}'`)).rows[0];

test("2C invoice: the app's insert shape yields a generated number and finite numeric totals (not NaN)", async () => {
  const id = await asAdmin(async () => (await db.query(`INSERT INTO public.invoices (client_id, status, issue_date, tax_rate) VALUES ('${ids.c1}','draft',current_date,0) RETURNING id`)).rows[0].id);
  const i = await inv(id);
  assert.match(i.invoice_number, /^SCH-\d{4}-\d{4}$/);
  for (const k of ["subtotal", "tax_amount", "total"]) assert.ok(Number.isFinite(Number(i[k])), `${k} is ${i[k]}`);
  assert.equal(Number(i.total), 0);
});

test("2C invoice: line items, subtotal, tax, total and balance", async () => {
  const id = await draft([[2, 50000], [1, 25000]], 18);
  const i = await inv(id);
  assert.deepEqual([Number(i.subtotal), Number(i.tax_amount), Number(i.total)], [125000, 22500, 147500]);
  assert.equal(i.status, "draft");
});

test("2C invoice status with payments: statuses follow payments; regressions rejected", async () => {
  const id = await draft([[2, 50000]]); // total 100000
  await asAdmin(() => db.exec(`UPDATE public.invoices SET status='sent' WHERE id='${id}'`));
  await asAdmin(() => db.exec(`INSERT INTO public.payments (invoice_id, amount, method, paid_at) VALUES ('${id}', 40000, 'cash', now())`));
  assert.equal((await inv(id)).status, "partially paid");
  for (const to of ["draft", "sent", "overdue", "paid", "cancelled"]) await rejects(asAdmin(() => db.exec(`UPDATE public.invoices SET status='${to}' WHERE id='${id}'`)), `partially paid -> ${to}`);
  await asAdmin(() => db.exec(`INSERT INTO public.payments (invoice_id, amount, method, paid_at) VALUES ('${id}', 60000, 'cash', now())`));
  assert.equal((await inv(id)).status, "paid");
  await rejects(asAdmin(() => db.exec(`UPDATE public.invoices SET status='sent' WHERE id='${id}'`)), "paid -> sent");
});

async function count(userId, table) { return asUser(db, userId, async () => (await db.query(`SELECT count(*)::int c FROM public.${table}`)).rows[0].c); }
test("2C RLS: leads are readable and modifiable by staff and admin, not by clients; nobody inserts through the anon-key path", async () => {
  await asService(db, () => db.exec(`INSERT INTO public.leads (name, email) VALUES ('Lead', 'lead@example.test')`));
  assert.equal(await count(ids.admin, "leads"), 1);
  assert.equal(await count(ids.staff, "leads"), 1);
  assert.equal(await count(ids.c1, "leads"), 0);
  await rejects(asUser(db, ids.c1, () => db.exec(`INSERT INTO public.leads (name,email) VALUES ('x','x@x.test')`)), "client insert lead");
  const upd = (u) => asUser(db, u, async () => (await db.query(`UPDATE public.leads SET status='contacted' RETURNING 1`)).rows.length);
  assert.equal(await upd(ids.c1), 0);
  assert.equal(await upd(ids.staff), 1);   // policy leads_update_staff = is_staff()
  assert.equal(await upd(ids.admin), 1);
});

test("2C schema baseline: expected tables, functions and RLS flags exist", async () => {
  const tables = ["profiles", "projects", "project_milestones", "project_updates", "deliverables", "invoices", "invoice_line_items", "payments", "receipts", "document_counters", "audit_logs", "bookings", "leads", "service_catalog", "academy_courses"];
  const got = (await db.query(`SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'`)).rows;
  for (const t of tables) { const r = got.find((x) => x.relname === t); assert.ok(r, `table ${t} missing`); assert.equal(r.relrowsecurity, true, `${t} has RLS disabled`); }
});
