// Migration 026: invoice Scope of Work — a single free-form text field stored
// separately from notes, persisted through RLS like the rest of the invoice,
// and wired from the create/edit forms to the PDF route.
import test, { before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDb, seed, asUser, q } from "./helpers/db.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const src = (p) => readFileSync(join(ROOT, p), "utf8");

let db, ids;
const FIN = "00000000-0000-0000-0000-0000000000f2";
before(async () => {
  db = await createDb();
  ids = await seed(db);
  await db.exec(`INSERT INTO auth.users (id, email) VALUES ('${FIN}', 'finance2@example.test');
                 UPDATE public.profiles SET role = 'finance' WHERE id = '${FIN}';`);
});
const row = async (id) => (await db.query(`SELECT * FROM public.invoices WHERE id='${id}'`)).rows[0];

const SCOPE = "Professional room and property photography\nShort-form video content / reels\nOne-day on-location production";

test("scope_of_work persists on create, is separate from notes, and can be edited", async () => {
  const id = await asUser(db, FIN, async () =>
    (await db.query(
      `INSERT INTO public.invoices (client_id, status, tax_rate, notes, scope_of_work)
       VALUES ('${ids.c1}', 'draft', 0, 'Payment due by the due date.', ${q(SCOPE)}) RETURNING id`
    )).rows[0].id
  );
  let i = await row(id);
  assert.equal(i.scope_of_work, SCOPE, "multiline scope stored verbatim");
  assert.equal(i.notes, "Payment due by the due date.", "notes untouched");

  await asUser(db, FIN, () => db.exec(`UPDATE public.invoices SET scope_of_work = 'Revised scope' WHERE id = '${id}'`));
  i = await row(id);
  assert.equal(i.scope_of_work, "Revised scope");
  assert.equal(i.notes, "Payment due by the due date.");

  // Additive column: an invoice without scope still works and totals are unaffected.
  const plain = await asUser(db, FIN, async () =>
    (await db.query(`INSERT INTO public.invoices (client_id, status, tax_rate) VALUES ('${ids.c1}','draft',0) RETURNING id`)).rows[0].id
  );
  assert.equal((await row(plain)).scope_of_work, null);
});

test("a client reads scope_of_work only on their own issued invoice (existing RLS applies)", async () => {
  const id = await asUser(db, FIN, async () =>
    (await db.query(`INSERT INTO public.invoices (client_id, status, tax_rate, scope_of_work) VALUES ('${ids.c1}','draft',0, ${q(SCOPE)}) RETURNING id`)).rows[0].id
  );
  const see = (u) => asUser(db, u, async () => (await db.query(`SELECT scope_of_work FROM public.invoices WHERE id='${id}'`)).rows);
  assert.equal((await see(ids.c1)).length, 0, "draft hidden from client");
  await asUser(db, FIN, () => db.exec(`UPDATE public.invoices SET status='sent' WHERE id='${id}'`));
  assert.equal((await see(ids.c1))[0].scope_of_work, SCOPE);
  assert.equal((await see(ids.c2)).length, 0, "other client cannot read it");
});

test("create and update actions write scope_of_work from the form", () => {
  const actions = src("lib/actions/invoices.ts");
  const create = actions.slice(actions.indexOf("export async function createInvoice"), actions.indexOf("export async function updateInvoice"));
  const update = actions.slice(actions.indexOf("export async function updateInvoice"), actions.indexOf("export async function addLineItem"));
  for (const body of [create, update]) {
    assert.match(body, /formData\.get\("scope_of_work"\)/);
    assert.match(body, /scope_of_work/);
    assert.match(body, /requireFinance\(\)/, "authorization gate unchanged");
  }
});

test("new and edit forms have exactly one plain multiline Scope of Work field, before Notes", () => {
  for (const f of ["app/admin/invoices/new/new-invoice-form.tsx", "app/admin/invoices/[id]/edit/edit-invoice-form.tsx"]) {
    const s = src(f);
    assert.equal((s.match(/name="scope_of_work"/g) || []).length, 1, `${f}: one scope field`);
    assert.match(s, /<textarea name="scope_of_work"/, `${f}: scope is a textarea`);
    assert.ok(s.indexOf('name="scope_of_work"') < s.indexOf('name="notes"'), `${f}: scope before notes`);
    assert.doesNotMatch(s, /scope_items|scopeRows|addScope|scope_category/i, `${f}: no structured scope UI`);
  }
});

test("PDF route renders the invoice's scope_of_work and filters schedules out of notes", () => {
  const route = src("app/api/invoices/[id]/pdf/route.ts");
  assert.match(route, /splitLines\(invoice!\.scope_of_work\)/);
  assert.match(route, /splitProjectNotes\(invoice!\.notes\)/);
  assert.doesNotMatch(route, /createAdminClient|SERVICE_ROLE/, "route still uses the caller's session only");
  assert.match(route, /canViewInvoiceDocument/, "explicit authorization gate unchanged");
});
