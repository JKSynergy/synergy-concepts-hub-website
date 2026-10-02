// Migrations 011/012: Finance role, finance-table RLS, service-catalogue writes, invoice lifecycle.
// Real PostgreSQL (PGlite) with migrations 001-012 applied; RLS and triggers as the anon-key client sees them.
import test, { before } from "node:test";
import assert from "node:assert/strict";
import { createDb, seed, asUser, asService, rejects } from "./helpers/db.mjs";

let db, ids;
const FIN = "00000000-0000-0000-0000-0000000000f1";
before(async () => {
  db = await createDb();
  ids = await seed(db);
  await db.exec(`INSERT INTO auth.users (id, email) VALUES ('${FIN}', 'finance@example.test');
                 UPDATE public.profiles SET role = 'finance' WHERE id = '${FIN}';
                 INSERT INTO public.projects (id, client_id, title) VALUES ('10000000-0000-0000-0000-0000000000f1', '${ids.c1}', 'P1');
                 INSERT INTO public.project_milestones (project_id, title) VALUES ('10000000-0000-0000-0000-0000000000f1', 'M1');
                 INSERT INTO public.project_updates (project_id, author_id, content, is_internal) VALUES ('10000000-0000-0000-0000-0000000000f1', '${ids.staff}', 'internal', true);
                 INSERT INTO public.leads (name, email) VALUES ('L', 'l@example.test');
                 INSERT INTO public.service_catalog (id, name, is_active) VALUES ('90000000-0000-0000-0000-000000000001', 'Svc', true);`);
});
const asFin = (f) => asUser(db, FIN, f);
const asAdmin = (f) => asUser(db, ids.admin, f);
const count = (u, t) => asUser(db, u, async () => (await db.query(`SELECT count(*)::int c FROM public.${t}`)).rows[0].c);
const rows = (u, sql) => asUser(db, u, async () => (await db.query(sql)).rows);
const inv = async (id) => (await db.query(`SELECT * FROM public.invoices WHERE id='${id}'`)).rows[0];

/** Invoice created by finance through RLS. */
async function mk(user = FIN, { client = ids.c1, items = [[2, 50000]], status = "draft" } = {}) {
  const id = await asUser(db, user, async () => {
    const r = await db.query(`INSERT INTO public.invoices (client_id, status, tax_rate) VALUES ('${client}','draft',0) RETURNING id`);
    for (const [q, p] of items) await db.exec(`INSERT INTO public.invoice_line_items (invoice_id, description, quantity, unit_price) VALUES ('${r.rows[0].id}','x',${q},${p})`);
    return r.rows[0].id;
  });
  if (status !== "draft") await asUser(db, user, () => db.exec(`UPDATE public.invoices SET status='${status}' WHERE id='${id}'`));
  return id;
}
const setStatus = (id, s, user = FIN) => asUser(db, user, () => db.exec(`UPDATE public.invoices SET status='${s}' WHERE id='${id}'`));
const payAs = (user, id, amt) => asUser(db, user, () => db.exec(`INSERT INTO public.payments (invoice_id, amount, method, paid_at) VALUES ('${id}', ${amt}, 'cash', now())`));

// ── FINANCE ─────────────────────────────────────────────────────────────────
test("FINANCE can create an invoice with line items; the database numbers it and computes totals", async () => {
  const id = await mk(FIN, { items: [[2, 50000], [1, 25000]] });
  const i = await inv(id);
  assert.match(i.invoice_number, /^SCH-\d{4}-\d{4}$/);
  assert.equal(Number(i.total), 125000);
});

test("FINANCE can edit a draft invoice, issue it, and record a payment; receipt and status follow", async () => {
  const id = await mk(FIN, { items: [[1, 100000]] });
  await asFin(() => db.exec(`UPDATE public.invoices SET notes='edited', due_date=current_date+7 WHERE id='${id}'`));
  assert.equal((await inv(id)).notes, "edited");
  await setStatus(id, "sent");
  await payAs(FIN, id, 40000);
  assert.equal((await inv(id)).status, "partially paid");
  await payAs(FIN, id, 60000);
  assert.equal((await inv(id)).status, "paid");
  assert.equal((await rows(FIN, `SELECT 1 FROM public.receipts WHERE invoice_id='${id}'`)).length, 2);
  assert.equal((await rows(FIN, `SELECT 1 FROM public.payments WHERE invoice_id='${id}'`)).length, 2); // payment history
});

test("FINANCE can read invoices, line items, payments, receipts (also what the reports read)", async () => {
  for (const t of ["invoices", "invoice_line_items", "payments", "receipts"]) assert.ok((await count(FIN, t)) > 0, t);
});

test("FINANCE can read Clients (client profiles) and Projects, but not staff/admin profiles", async () => {
  const p = await rows(FIN, `SELECT id, role FROM public.profiles`);
  assert.ok(p.some((r) => r.id === ids.c1) && p.some((r) => r.id === ids.c2));
  assert.ok(!p.some((r) => r.id === ids.admin || r.id === ids.staff), "finance must not read admin/staff profiles");
  assert.equal(await count(FIN, "projects"), 1);
  assert.equal(await count(FIN, "project_milestones"), 1);
});

test("FINANCE is not operational staff: no internal updates, leads or bookings; no audit log; no project writes", async () => {
  assert.equal(await count(FIN, "project_updates"), 0);
  assert.equal(await count(FIN, "leads"), 0);
  assert.equal(await count(FIN, "audit_logs"), 0);
  const n = await asFin(async () => (await db.query(`UPDATE public.projects SET title='hacked' RETURNING 1`)).rows.length);
  assert.equal(n, 0);
  await rejects(asFin(() => db.exec(`INSERT INTO public.projects (client_id, title) VALUES ('${ids.c1}','x')`)), "finance project insert");
});

test("FINANCE cannot manage roles or become Admin", async () => {
  await rejects(asFin(() => db.exec(`UPDATE public.profiles SET role='admin' WHERE id='${FIN}'`)), "self-promote");
  // RLS makes other users' rows a silent no-op for finance; either outcome must leave roles unchanged
  await asFin(() => db.exec(`UPDATE public.profiles SET role='finance' WHERE id='${ids.c1}'`)).catch(() => {});
  await asFin(() => db.exec(`UPDATE public.profiles SET role='admin' WHERE id='${ids.staff}'`)).catch(() => {});
  const r = (await db.query(`SELECT id, role FROM public.profiles WHERE id IN ('${ids.c1}','${ids.staff}')`)).rows;
  assert.equal(r.find((x) => x.id === ids.c1).role, "client");
  assert.equal(r.find((x) => x.id === ids.staff).role, "staff");
  assert.equal((await db.query(`SELECT role FROM public.profiles WHERE id='${FIN}'`)).rows[0].role, "finance");
});

test("FINANCE cannot delete invoices (admin only) and cannot touch the service catalogue", async () => {
  const id = await mk(FIN);
  await asFin(() => db.exec(`DELETE FROM public.invoices WHERE id='${id}'`));
  assert.ok(await inv(id), "finance delete must be a no-op");
  await rejects(asFin(() => db.exec(`INSERT INTO public.service_catalog (name) VALUES ('x')`)), "finance service insert");
  const n = await asFin(async () => (await db.query(`UPDATE public.service_catalog SET name='y' RETURNING 1`)).rows.length);
  assert.equal(n, 0);
});

test("FINANCE can use the document-number RPC; staff cannot", async () => {
  assert.match((await asFin(async () => (await db.query(`SELECT public.generate_invoice_number() n`)).rows[0].n)), /^SCH-/);
  await rejects(asUser(db, ids.staff, () => db.query(`SELECT public.generate_invoice_number()`)), "staff rpc");
});

test("an ARCHIVED finance user loses all finance access", async () => {
  const A = "00000000-0000-0000-0000-0000000000f2";
  await db.exec(`INSERT INTO auth.users (id, email) VALUES ('${A}', 'oldfin@example.test'); UPDATE public.profiles SET role='finance' WHERE id='${A}';`);
  assert.ok((await count(A, "invoices")) > 0);
  await db.exec(`UPDATE public.profiles SET archived_at = now() WHERE id='${A}'`);
  assert.equal(await count(A, "invoices"), 0);
  await rejects(asUser(db, A, () => db.exec(`INSERT INTO public.invoices (client_id) VALUES ('${ids.c1}')`)), "archived finance insert");
});

// ── ADMIN role assignment ───────────────────────────────────────────────────
test("only ADMIN can assign and remove the finance role (and not on themselves)", async () => {
  await asAdmin(() => db.exec(`UPDATE public.profiles SET role='finance' WHERE id='${ids.staff}'`));
  assert.equal((await db.query(`SELECT role FROM public.profiles WHERE id='${ids.staff}'`)).rows[0].role, "finance");
  await asAdmin(() => db.exec(`UPDATE public.profiles SET role='staff' WHERE id='${ids.staff}'`));
  assert.equal((await db.query(`SELECT role FROM public.profiles WHERE id='${ids.staff}'`)).rows[0].role, "staff");
  await rejects(asAdmin(() => db.exec(`UPDATE public.profiles SET role='finance' WHERE id='${ids.admin}'`)), "admin self-change");
  await rejects(asUser(db, ids.staff, () => db.exec(`UPDATE public.profiles SET role='finance' WHERE id='${ids.staff}'`)), "staff self-assign");
  await rejects(asUser(db, ids.c1, () => db.exec(`UPDATE public.profiles SET role='finance' WHERE id='${ids.c1}'`)), "client self-assign");
  // sign-up metadata still cannot choose finance
  await db.exec(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ('00000000-0000-0000-0000-0000000000f9','x@example.test','{"role":"finance"}')`);
  assert.equal((await db.query(`SELECT role FROM public.profiles WHERE id='00000000-0000-0000-0000-0000000000f9'`)).rows[0].role, "client");
});

// ── STAFF ───────────────────────────────────────────────────────────────────
test("STAFF cannot read invoices, line items, payments or receipts (database level)", async () => {
  const id = await mk(ids.admin, { items: [[1, 1000]], status: "sent" });
  await payAs(ids.admin, id, 500);
  for (const t of ["invoices", "invoice_line_items", "payments", "receipts"]) {
    assert.ok((await count(ids.admin, t)) > 0, `admin sees ${t}`);
    assert.equal(await count(ids.staff, t), 0, `staff sees ${t}`);
  }
  assert.equal((await rows(ids.staff, `SELECT * FROM public.invoices WHERE id='${id}'`)).length, 0);
});

test("STAFF cannot read what financial reports are built from (aggregates return nothing)", async () => {
  const r = await rows(ids.staff, `SELECT COALESCE(SUM(total),0) t, COUNT(*)::int c FROM public.invoices`);
  assert.deepEqual([Number(r[0].t), r[0].c], [0, 0]);
  const p = await rows(ids.staff, `SELECT COALESCE(SUM(amount),0) t, COUNT(*)::int c FROM public.payments`);
  assert.deepEqual([Number(p[0].t), p[0].c], [0, 0]);
});

test("STAFF can read Services (active and inactive) but cannot create, edit, delete or reprice", async () => {
  await asService(db, () => db.exec(`INSERT INTO public.service_catalog (id, name, is_active) VALUES ('90000000-0000-0000-0000-000000000002','Hidden',false)`));
  assert.ok((await count(ids.staff, "service_catalog")) >= 2);
  await rejects(asUser(db, ids.staff, () => db.exec(`INSERT INTO public.service_catalog (name) VALUES ('x')`)), "staff insert");
  const upd = await asUser(db, ids.staff, async () => (await db.query(`UPDATE public.service_catalog SET name='y' RETURNING 1`)).rows.length);
  const del = await asUser(db, ids.staff, async () => (await db.query(`DELETE FROM public.service_catalog RETURNING 1`)).rows.length);
  assert.deepEqual([upd, del], [0, 0]);
  const cols = (await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name='service_catalog'`)).rows.map((r) => r.column_name);
  if (cols.includes("price")) assert.equal(await asUser(db, ids.staff, async () => (await db.query(`UPDATE public.service_catalog SET price = 1 RETURNING 1`)).rows.length), 0);
  assert.ok((await db.query(`SELECT 1 FROM public.service_catalog WHERE name='Svc'`)).rows.length === 1, "catalogue unchanged");
});

test("ADMIN still writes Services; clients read active services only and cannot write", async () => {
  assert.equal(await asAdmin(async () => (await db.query(`INSERT INTO public.service_catalog (name) VALUES ('Admin svc') RETURNING 1`)).rows.length), 1);
  await rejects(asUser(db, ids.c1, () => db.exec(`INSERT INTO public.service_catalog (name) VALUES ('x')`)), "client insert");
  const seen = await rows(ids.c1, `SELECT is_active FROM public.service_catalog`);
  assert.ok(seen.length > 0 && seen.every((r) => r.is_active));
});

// ── CLIENT isolation is intact ──────────────────────────────────────────────
test("CLIENT isolation: own non-draft invoices only; nothing of another client's; no finance-role leakage", async () => {
  const d = await mk(FIN, { client: ids.c1, items: [[1, 10]] });                       // draft
  const s1 = await mk(FIN, { client: ids.c1, items: [[1, 10]], status: "sent" });
  const s2 = await mk(FIN, { client: ids.c2, items: [[1, 10]], status: "sent" });
  const c1 = (await rows(ids.c1, `SELECT id, client_id FROM public.invoices`));
  assert.ok(c1.every((r) => r.client_id === ids.c1));
  assert.ok(c1.some((r) => r.id === s1) && !c1.some((r) => r.id === d) && !c1.some((r) => r.id === s2));
  assert.equal((await rows(ids.c1, `SELECT 1 FROM public.invoice_line_items WHERE invoice_id='${s2}'`)).length, 0);
  assert.equal((await rows(ids.c1, `SELECT id FROM public.profiles`)).length, 1);
  assert.equal(await count(ids.c1, "projects"), 1);
  await rejects(asUser(db, ids.c1, () => db.exec(`INSERT INTO public.invoices (client_id) VALUES ('${ids.c1}')`)), "client invoice insert");
  await rejects(asUser(db, ids.c1, () => db.exec(`INSERT INTO public.payments (invoice_id, amount, method, paid_at) VALUES ('${s1}', 1, 'cash', now())`)), "client payment insert");
});

// ── INVOICE LIFECYCLE ───────────────────────────────────────────────────────
test("LIFECYCLE: SENT -> DRAFT fails (any issued invoice, any role, service role too)", async () => {
  for (const from of ["sent", "overdue", "cancelled"]) {
    const id = await mk(FIN); await setStatus(id, "sent"); if (from !== "sent") await setStatus(id, from);
    await rejects(setStatus(id, "draft", FIN), `finance ${from}->draft`);
    await rejects(setStatus(id, "draft", ids.admin), `admin ${from}->draft`);
    await rejects(asService(db, () => db.exec(`UPDATE public.invoices SET status='draft' WHERE id='${id}'`)), `service ${from}->draft`);
    assert.equal((await inv(id)).status, from);
  }
});

test("LIFECYCLE: PAID -> CANCELLED fails", async () => {
  const id = await mk(FIN, { items: [[1, 1000]], status: "sent" });
  await payAs(FIN, id, 1000);
  assert.equal((await inv(id)).status, "paid");
  await rejects(setStatus(id, "cancelled"), "paid->cancelled");
  await rejects(asService(db, () => db.exec(`UPDATE public.invoices SET status='cancelled' WHERE id='${id}'`)), "service paid->cancelled");
  assert.equal((await inv(id)).status, "paid");
});

test("LIFECYCLE: PARTIALLY PAID -> CANCELLED fails", async () => {
  const id = await mk(FIN, { items: [[1, 1000]], status: "sent" });
  await payAs(FIN, id, 400);
  assert.equal((await inv(id)).status, "partially paid");
  await rejects(setStatus(id, "cancelled"), "partial->cancelled");
  await rejects(asService(db, () => db.exec(`UPDATE public.invoices SET status='cancelled' WHERE id='${id}'`)), "service partial->cancelled");
  assert.equal((await inv(id)).status, "partially paid");
});

test("LIFECYCLE: valid transitions still work", async () => {
  const a = await mk(FIN); await setStatus(a, "sent"); await setStatus(a, "overdue"); await setStatus(a, "sent"); await setStatus(a, "cancelled");
  assert.equal((await inv(a)).status, "cancelled");
  const b = await mk(FIN); await setStatus(b, "cancelled");             // draft -> cancelled (never issued)
  assert.equal((await inv(b)).status, "cancelled");
  const c = await mk(FIN, { items: [[1, 100]], status: "sent" });       // sent -> partially paid -> paid via payments
  await payAs(FIN, c, 30); await payAs(FIN, c, 70);
  assert.equal((await inv(c)).status, "paid");
  const d = await mk(FIN, { items: [[1, 100]], status: "sent" });       // Paystack-style settlement (service role) still works
  await asService(db, () => db.exec(`INSERT INTO public.payments (invoice_id, amount, method, paid_at, paystack_reference) VALUES ('${d}', 100, 'paystack', now(), 'ref-lifecycle-1')`));
  assert.equal((await inv(d)).status, "paid");
});

test("LIFECYCLE: an unpaid invoice cannot be set to paid or partially paid", async () => {
  const id = await mk(FIN, { status: "sent" });
  await rejects(setStatus(id, "paid"), "unpaid->paid");
  await rejects(setStatus(id, "partially paid"), "unpaid->partial");
});
