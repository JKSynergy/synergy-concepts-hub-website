// Finance / data-integrity regression tests against real Postgres with
// migrations 001-010 applied.
import test, { before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { createDb, seed, asUser, asService, rejects } from "./helpers/db.mjs";

let db, ids;
before(async () => {
  db = await createDb();
  ids = await seed(db);
});

let n = 0;
const uid = (prefix) => `${prefix}0000000-0000-0000-0000-${String(++n).padStart(12, "0")}`;

/** Create an invoice through the admin session: items = [[qty, unit_price], ...] */
async function makeInvoice({ client = ids.c1, tax = 0, items = [[1, 100]], status = "sent" } = {}) {
  const id = uid("5");
  await asUser(db, ids.admin, async () => {
    await db.exec(`INSERT INTO public.invoices (id, client_id, tax_rate) VALUES ('${id}', '${client}', ${tax})`);
    for (const [q, p] of items) {
      await db.exec(`INSERT INTO public.invoice_line_items (invoice_id, description, quantity, unit_price) VALUES ('${id}', 'item', ${q}, ${p})`);
    }
    if (status !== "draft") await db.exec(`UPDATE public.invoices SET status = '${status}' WHERE id = '${id}'`);
  });
  return id;
}
const inv = async (id) => (await db.query(`SELECT * FROM public.invoices WHERE id = '${id}'`)).rows[0];
const pay = (id, amount, extra = "") =>
  db.exec(`INSERT INTO public.payments (invoice_id, amount, method, paid_at ${extra ? ", " + extra.split("=")[0] : ""}) VALUES ('${id}', ${amount}, 'cash', now() ${extra ? ", " + extra.split("=")[1] : ""})`);
const asAdmin = (fn) => asUser(db, ids.admin, fn);
const asSvc = (fn) => asService(db, fn);

// ── Totals: one authoritative calculation ────────────────────────────────────
test("totals: no tax", async () => {
  const id = await makeInvoice({ items: [[2, 50]] });
  const i = await inv(id);
  assert.deepEqual([Number(i.subtotal), Number(i.tax_amount), Number(i.total)], [100, 0, 100]);
});

test("totals: tax and multiple line items with decimals", async () => {
  const id = await makeInvoice({ tax: 18, items: [[3, 33.33], [1, 0.01], [2.5, 10]] });
  const i = await inv(id);
  // 99.99 + 0.01 + 25.00 = 125.00 ; tax 18% = 22.50
  assert.deepEqual([Number(i.subtotal), Number(i.tax_amount), Number(i.total)], [125, 22.5, 147.5]);
});

test("totals: tax is rounded once, to 2 decimals, in the database", async () => {
  const id = await makeInvoice({ tax: 18, items: [[3, 33.33]] });
  const i = await inv(id);
  assert.equal(Number(i.subtotal), 99.99);
  assert.equal(Number(i.tax_amount), 18);      // 17.9982 -> 18.00
  assert.equal(Number(i.total), 117.99);
});

test("totals: a forged line-item amount or forged invoice total is overwritten", async () => {
  const id = await makeInvoice({ items: [[2, 50]] });
  await asAdmin(() => db.exec(`INSERT INTO public.invoice_line_items (invoice_id, description, quantity, unit_price, amount) VALUES ('${id}', 'forged', 1, 10, 99999)`));
  await asAdmin(() => db.exec(`UPDATE public.invoices SET total = 1, subtotal = 1, tax_amount = 0 WHERE id = '${id}'`));
  const i = await inv(id);
  assert.deepEqual([Number(i.subtotal), Number(i.total)], [110, 110]);
});

test("totals: changing tax rate recomputes; deleting a line item recomputes", async () => {
  const id = await makeInvoice({ items: [[1, 100], [1, 50]] });
  await asAdmin(() => db.exec(`UPDATE public.invoices SET tax_rate = 10 WHERE id = '${id}'`));
  assert.equal(Number((await inv(id)).total), 165);
  await asAdmin(() => db.exec(`DELETE FROM public.invoice_line_items WHERE invoice_id = '${id}' AND unit_price = 50`));
  assert.equal(Number((await inv(id)).total), 110);
});

test("totals cannot change once a payment exists", async () => {
  const id = await makeInvoice({ items: [[1, 100]] });
  await asAdmin(() => pay(id, 30));
  await rejects(asAdmin(() => db.exec(`UPDATE public.invoices SET tax_rate = 18 WHERE id = '${id}'`)));
  await rejects(asAdmin(() => db.exec(`INSERT INTO public.invoice_line_items (invoice_id, description, quantity, unit_price) VALUES ('${id}', 'late', 1, 5)`)));
  await rejects(asAdmin(() => db.exec(`DELETE FROM public.invoice_line_items WHERE invoice_id = '${id}'`)));
  assert.equal(Number((await inv(id)).total), 100);
});

test("invalid quantities, prices, tax rates and payment amounts are rejected", async () => {
  const id = await makeInvoice({ items: [[1, 100]] });
  await rejects(asAdmin(() => db.exec(`INSERT INTO public.invoice_line_items (invoice_id, description, quantity, unit_price) VALUES ('${id}', 'x', 0, 5)`)));
  await rejects(asAdmin(() => db.exec(`INSERT INTO public.invoice_line_items (invoice_id, description, quantity, unit_price) VALUES ('${id}', 'x', 1, -5)`)));
  await rejects(asAdmin(() => db.exec(`UPDATE public.invoices SET tax_rate = 150 WHERE id = '${id}'`)));
  await rejects(asAdmin(() => pay(id, 0)));
  await rejects(asAdmin(() => pay(id, -10)));
});

// ── Payment states ───────────────────────────────────────────────────────────
test("a draft invoice cannot be paid", async () => {
  const id = await makeInvoice({ status: "draft" });
  const e = await rejects(asAdmin(() => pay(id, 10)));
  assert.match(e.message, /cannot receive a payment \(status: draft\)/);
});

test("a cancelled invoice cannot be paid", async () => {
  const id = await makeInvoice({ status: "cancelled" });
  const e = await rejects(asAdmin(() => pay(id, 10)));
  assert.match(e.message, /status: cancelled/);
});

test("partial then full payment: statuses, receipts and balance", async () => {
  const id = await makeInvoice({ items: [[1, 100]] });
  await asAdmin(() => pay(id, 40));
  assert.equal((await inv(id)).status, "partially paid");
  await asAdmin(() => pay(id, 60));
  assert.equal((await inv(id)).status, "paid");
  const receipts = (await db.query(`SELECT receipt_number FROM public.receipts WHERE invoice_id = '${id}' ORDER BY receipt_number`)).rows;
  assert.equal(receipts.length, 2);
  assert.notEqual(receipts[0].receipt_number, receipts[1].receipt_number);
  const paid = (await db.query(`SELECT SUM(amount) AS s FROM public.payments WHERE invoice_id = '${id}' AND paid_at IS NOT NULL`)).rows[0].s;
  assert.equal(Number(paid), 100);
});

test("a fully paid invoice cannot be paid again", async () => {
  const id = await makeInvoice({ items: [[1, 100]] });
  await asAdmin(() => pay(id, 100));
  assert.equal((await inv(id)).status, "paid");
  await rejects(asAdmin(() => pay(id, 1)));
});

test("a payment cannot exceed the outstanding balance", async () => {
  const id = await makeInvoice({ items: [[1, 100]] });
  await asAdmin(() => pay(id, 70));
  const e = await rejects(asAdmin(() => pay(id, 30.01)));
  assert.match(e.message, /exceeds the outstanding balance/);
  await asAdmin(() => pay(id, 30));
  assert.equal((await inv(id)).status, "paid");
});

test("settling a pending payment enforces the same rules (Paystack path, service role)", async () => {
  const id = await makeInvoice({ items: [[1, 100]] });
  await asSvc(() => db.exec(`INSERT INTO public.payments (id, invoice_id, amount, method, paystack_reference) VALUES ('60000000-0000-0000-0000-00000000aa01', '${id}', 100, 'paystack', 'SCH-REF-A')`));
  // the invoice is partly paid by another route before the webhook arrives
  await asAdmin(() => pay(id, 20));
  const e = await rejects(asSvc(() => db.exec(`UPDATE public.payments SET paid_at = now() WHERE paystack_reference = 'SCH-REF-A'`)));
  assert.match(e.message, /exceeds the outstanding balance/);
});

test("a settled payment is frozen", async () => {
  const id = await makeInvoice({ items: [[1, 100]] });
  await asAdmin(() => pay(id, 40));
  await rejects(asAdmin(() => db.exec(`UPDATE public.payments SET amount = 1 WHERE invoice_id = '${id}'`)));
  await rejects(asAdmin(() => db.exec(`UPDATE public.payments SET paid_at = NULL WHERE invoice_id = '${id}'`)));
  const other = await makeInvoice({ items: [[1, 100]] });
  await rejects(asAdmin(() => db.exec(`UPDATE public.payments SET invoice_id = '${other}' WHERE invoice_id = '${id}'`)));
});

// ── Webhook idempotency at the database ─────────────────────────────────────
test("paystack_reference is unique: a duplicate payment row cannot be created", async () => {
  const id = await makeInvoice({ items: [[1, 100]] });
  await asSvc(() => db.exec(`INSERT INTO public.payments (invoice_id, amount, method, paystack_reference) VALUES ('${id}', 10, 'paystack', 'SCH-REF-DUP')`));
  await rejects(asSvc(() => db.exec(`INSERT INTO public.payments (invoice_id, amount, method, paystack_reference) VALUES ('${id}', 10, 'paystack', 'SCH-REF-DUP')`)));
  // several pending attempts with different references are fine
  await asSvc(() => db.exec(`INSERT INTO public.payments (invoice_id, amount, method, paystack_reference) VALUES ('${id}', 10, 'paystack', 'SCH-REF-DUP-2')`));
});

test("settling the same reference twice creates one receipt and one payment", async () => {
  const id = await makeInvoice({ items: [[1, 100]] });
  await asSvc(() => db.exec(`INSERT INTO public.payments (invoice_id, amount, method, paystack_reference) VALUES ('${id}', 100, 'paystack', 'SCH-REF-ONCE')`));
  const settle = () => db.query(`UPDATE public.payments SET paid_at = now() WHERE paystack_reference = 'SCH-REF-ONCE' AND paid_at IS NULL RETURNING id`);
  const first = await asSvc(settle);
  const second = await asSvc(settle);
  assert.equal(first.rows.length, 1);
  assert.equal(second.rows.length, 0, "a repeated delivery must not match an already-settled payment");
  const r = await db.query(`SELECT (SELECT count(*) FROM public.payments WHERE paystack_reference = 'SCH-REF-ONCE')::int AS p, (SELECT count(*) FROM public.receipts WHERE invoice_id = '${id}')::int AS r`);
  assert.deepEqual([r.rows[0].p, r.rows[0].r], [1, 1]);
});

// ── Manual status changes must agree with payments ──────────────────────────
test("an invoice cannot be marked paid without covering payments, nor returned to sent after payment", async () => {
  const id = await makeInvoice({ items: [[1, 100]] });
  await rejects(asAdmin(() => db.exec(`UPDATE public.invoices SET status = 'paid' WHERE id = '${id}'`)));
  await rejects(asAdmin(() => db.exec(`UPDATE public.invoices SET status = 'partially paid' WHERE id = '${id}'`)));
  await asAdmin(() => pay(id, 10));
  await rejects(asAdmin(() => db.exec(`UPDATE public.invoices SET status = 'sent' WHERE id = '${id}'`)));
  // (012) a paid or partially paid invoice can no longer be cancelled
  await rejects(asAdmin(() => db.exec(`UPDATE public.invoices SET status = 'cancelled' WHERE id = '${id}'`)));
  assert.equal((await inv(id)).status, "partially paid");
});

// ── Deletion / history ──────────────────────────────────────────────────────
test("only a draft invoice without payments can be deleted", async () => {
  const draft = await makeInvoice({ status: "draft", items: [[1, 5]] });
  await asAdmin(() => db.exec(`DELETE FROM public.invoices WHERE id = '${draft}'`));
  assert.equal((await db.query(`SELECT 1 FROM public.invoices WHERE id = '${draft}'`)).rows.length, 0);
  const sent = await makeInvoice({ status: "sent", items: [[1, 5]] });
  await rejects(asAdmin(() => db.exec(`DELETE FROM public.invoices WHERE id = '${sent}'`)));
  await rejects(asSvc(() => db.exec(`DELETE FROM public.invoices WHERE id = '${sent}'`)));
  const paid = await makeInvoice({ items: [[1, 5]] });
  await asAdmin(() => pay(paid, 5));
  await rejects(asSvc(() => db.exec(`DELETE FROM public.invoices WHERE id = '${paid}'`)));
});

test("deleting a client cannot destroy invoices, payments, receipts or projects", async () => {
  const c = "00000000-0000-0000-0000-0000000000d1";
  await db.exec(`INSERT INTO auth.users (id, email) VALUES ('${c}', 'history@example.test')`);
  const id = await makeInvoice({ client: c, items: [[1, 100]] });
  await asAdmin(() => pay(id, 100));
  await rejects(asSvc(() => db.exec(`DELETE FROM public.profiles WHERE id = '${c}'`)));
  await rejects(db.exec(`DELETE FROM auth.users WHERE id = '${c}'`));  // cascade to profiles is blocked too
  const left = await db.query(`SELECT (SELECT count(*) FROM public.invoices WHERE client_id = '${c}')::int AS i, (SELECT count(*) FROM public.payments WHERE invoice_id = '${id}')::int AS p, (SELECT count(*) FROM public.receipts WHERE invoice_id = '${id}')::int AS r`);
  assert.deepEqual([left.rows[0].i, left.rows[0].p, left.rows[0].r], [1, 1, 1]);
  // projects are also protected
  const c3 = "00000000-0000-0000-0000-0000000000d2";
  await db.exec(`INSERT INTO auth.users (id, email) VALUES ('${c3}', 'proj@example.test')`);
  await db.exec(`INSERT INTO public.projects (client_id, title) VALUES ('${c3}', 'kept')`);
  await rejects(asSvc(() => db.exec(`DELETE FROM public.profiles WHERE id = '${c3}'`)));
});

test("a client with no history can still be removed (and the audit trail survives)", async () => {
  const c = "00000000-0000-0000-0000-0000000000d3";
  await db.exec(`INSERT INTO auth.users (id, email) VALUES ('${c}', 'clean@example.test')`);
  await asSvc(() => db.exec(`UPDATE public.profiles SET archived_at = now() WHERE id = '${c}'`)); // writes an audit row
  await db.exec(`DELETE FROM auth.users WHERE id = '${c}'`);
  const a = await db.query(`SELECT actor_id, record_id FROM public.audit_logs WHERE action = 'profile.archived' AND record_id = '${c}'`);
  assert.equal(a.rows.length, 1, "audit rows are not deleted with the profile");
});

// ── Numbering ───────────────────────────────────────────────────────────────
test("invoice numbers are unique, sequential and never reused after deleting the latest", async () => {
  const a = await makeInvoice({ status: "draft" });
  const b = await makeInvoice({ status: "draft" });
  const na = (await inv(a)).invoice_number, nb = (await inv(b)).invoice_number;
  assert.match(na, /^SCH-\d{4}-\d{4}$/);
  const seq = (s) => Number(s.split("-")[2]);
  assert.equal(seq(nb), seq(na) + 1);
  await asAdmin(() => db.exec(`DELETE FROM public.invoices WHERE id = '${b}'`));
  const c = await makeInvoice({ status: "draft" });
  assert.equal(seq((await inv(c)).invoice_number), seq(nb) + 1, "the deleted number is not handed out again");
});

test("the number-generator RPC works for admins and is refused for clients and staff", async () => {
  const r = await asAdmin(() => db.query(`SELECT public.generate_invoice_number() AS n`));
  assert.match(r.rows[0].n, /^SCH-\d{4}-\d{4}$/);
  await rejects(asUser(db, ids.c1, () => db.query(`SELECT public.generate_invoice_number()`)));
  await rejects(asUser(db, ids.staff, () => db.query(`SELECT public.generate_invoice_number()`)));
});

test("an invoice number cannot be edited after creation", async () => {
  const id = await makeInvoice({ status: "draft" });
  await rejects(asAdmin(() => db.exec(`UPDATE public.invoices SET invoice_number = 'SCH-2026-0001' WHERE id = '${id}'`)));
});

test("many numbers taken back-to-back are all distinct", async () => {
  const nums = new Set();
  for (let i = 0; i < 25; i++) {
    const r = await asSvc(() => db.query(`SELECT public.generate_invoice_number() AS n`));
    nums.add(r.rows[0].n);
  }
  assert.equal(nums.size, 25);
});

// ── Audit trail for financial events ────────────────────────────────────────
test("invoice creation, status changes and payments are audited", async () => {
  const id = await makeInvoice({ items: [[1, 100]] }); // created -> sent
  await asAdmin(() => pay(id, 100));                   // payment recorded/settled, invoice -> paid
  const { rows } = await db.query(`SELECT action, actor_id FROM public.audit_logs WHERE record_id = '${id}' OR record_id IN (SELECT id FROM public.payments WHERE invoice_id = '${id}') ORDER BY created_at, id`);
  const actions = rows.map((r) => r.action);
  assert.ok(actions.includes("invoice.created"));
  assert.ok(actions.includes("invoice.status_changed"));
  assert.ok(actions.includes("payment.recorded"));
  assert.ok(rows.filter((r) => r.action.startsWith("invoice.") || r.action === "payment.recorded").every((r) => r.actor_id === ids.admin));
});

test("a webhook-style settlement (no user) is audited as payment.settled with a null actor", async () => {
  const id = await makeInvoice({ items: [[1, 100]] });
  await asSvc(() => db.exec(`INSERT INTO public.payments (id, invoice_id, amount, method, paystack_reference) VALUES ('60000000-0000-0000-0000-00000000bb01', '${id}', 100, 'paystack', 'SCH-REF-AUD')`));
  await asSvc(() => db.exec(`UPDATE public.payments SET paid_at = now() WHERE paystack_reference = 'SCH-REF-AUD'`));
  const { rows } = await db.query(`SELECT actor_id FROM public.audit_logs WHERE action = 'payment.settled' AND record_id = '60000000-0000-0000-0000-00000000bb01'`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actor_id, null);
});

// ── Migration safety ────────────────────────────────────────────────────────
test("migration 010 refuses to run (and changes nothing) when duplicate Paystack references already exist", async () => {
  const old = await createDb({ upTo: "009_fix_partial_payment_trigger.sql" });
  const oi = await seed(old);
  await old.exec(`INSERT INTO public.invoices (id, client_id, invoice_number, status) VALUES ('50000000-0000-0000-0000-00000000dd01', '${oi.c1}', 'SCH-2026-0001', 'sent');
    INSERT INTO public.payments (invoice_id, amount, method, paystack_reference) VALUES
      ('50000000-0000-0000-0000-00000000dd01', 5, 'paystack', 'dup'), ('50000000-0000-0000-0000-00000000dd01', 5, 'paystack', 'dup');`);
  const here = dirname(fileURLToPath(import.meta.url));
  const sql = readFileSync(join(here, "..", "supabase", "migrations", "010_phase1_security_remediation.sql"), "utf8");
  // one transaction: a failure must leave the old schema exactly as it was
  const e = await rejects(old.exec(`BEGIN; ${sql}; COMMIT;`));
  assert.match(e.message, /Duplicate payments\.paystack_reference/);
  await old.exec("ROLLBACK");
  const rows = await old.query(`SELECT count(*)::int AS n FROM public.payments`);
  assert.equal(rows.rows[0].n, 2, "no financial rows were deleted");
  const roleGuard = await old.query(`SELECT 1 FROM pg_trigger WHERE tgname = 'profiles_guard_update'`);
  assert.equal(roleGuard.rows.length, 0, "the migration applied nothing after failing");
});

test("migration 010 applies cleanly on top of existing data and continues numbering after it", async () => {
  const y = new Date().getFullYear();
  const old = await createDb({ upTo: "009_fix_partial_payment_trigger.sql" });
  const oi = await seed(old);
  await old.exec(`
    INSERT INTO public.invoices (id, client_id, invoice_number, status) VALUES
      ('50000000-0000-0000-0000-00000000ee01', '${oi.c1}', 'SCH-${y}-0041', 'sent'),
      ('50000000-0000-0000-0000-00000000ee02', '${oi.c1}', 'SCH-${y}-0042', 'sent');
    INSERT INTO public.invoice_line_items (invoice_id, description, quantity, unit_price, amount) VALUES
      ('50000000-0000-0000-0000-00000000ee01', 'legacy', 2, 10, 20);`);
  const here = dirname(fileURLToPath(import.meta.url));
  const sql = readFileSync(join(here, "..", "supabase", "migrations", "010_phase1_security_remediation.sql"), "utf8");
  await old.exec(sql);
  const r = await old.query(`SELECT public.next_document_number('invoice', 'SCH') AS n`);
  assert.equal(r.rows[0].n, `SCH-${y}-0043`);
  const legacy = await old.query(`SELECT total FROM public.invoices WHERE id = '50000000-0000-0000-0000-00000000ee01'`);
  assert.equal(Number(legacy.rows[0].total), 20, "a stale legacy header total is re-derived from its line items");
});

test("the client of an issued invoice cannot be changed, a draft's can", async () => {
  const draft = await makeInvoice({ status: "draft" });
  await asAdmin(() => db.exec(`UPDATE public.invoices SET client_id = '${ids.c2}' WHERE id = '${draft}'`));
  const sent = await makeInvoice({ status: "sent" });
  await rejects(asAdmin(() => db.exec(`UPDATE public.invoices SET client_id = '${ids.c2}' WHERE id = '${sent}'`)));
});
