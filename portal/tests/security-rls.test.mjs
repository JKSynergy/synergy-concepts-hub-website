// Authorization regression tests, run against real Postgres with the project's
// own migrations (001-010) applied. They exercise RLS and triggers the way the
// Supabase anon-key client does (role "authenticated", auth.uid() set).
import test, { before } from "node:test";
import assert from "node:assert/strict";
import { createDb, seed, asUser, asService, rejects } from "./helpers/db.mjs";

let db, ids;
const P1 = "10000000-0000-0000-0000-000000000001"; // client 1 project
const P2 = "10000000-0000-0000-0000-000000000002"; // client 2 project

before(async () => {
  db = await createDb();
  ids = await seed(db);
  await db.exec(`
    INSERT INTO public.projects (id, client_id, title) VALUES
      ('${P1}', '${ids.c1}', 'Client 1 project'),
      ('${P2}', '${ids.c2}', 'Client 2 project');
    INSERT INTO public.project_milestones (id, project_id, title, status, weight_percent) VALUES
      ('20000000-0000-0000-0000-000000000001', '${P1}', 'M submitted', 'submitted', 50),
      ('20000000-0000-0000-0000-000000000002', '${P1}', 'M pending', 'pending', 50);
    INSERT INTO public.project_updates (project_id, author_id, content, is_internal) VALUES
      ('${P1}', '${ids.staff}', 'visible note', false),
      ('${P1}', '${ids.staff}', 'INTERNAL note', true),
      ('${P2}', '${ids.staff}', 'other client note', false);
    INSERT INTO public.deliverables (id, project_id, name, file_url, is_visible_to_client) VALUES
      ('30000000-0000-0000-0000-000000000001', '${P1}', 'visible.pdf', '${P1}/visible.pdf', true),
      ('30000000-0000-0000-0000-000000000002', '${P1}', 'hidden.zip', '${P1}/hidden.zip', false),
      ('30000000-0000-0000-0000-000000000003', '${P2}', 'other.pdf', '${P2}/other.pdf', true);
    INSERT INTO public.bookings (id, client_id, type, title, status) VALUES
      ('40000000-0000-0000-0000-000000000001', '${ids.c1}', 'consultation', 'C1 booking', 'pending'),
      ('40000000-0000-0000-0000-000000000002', '${ids.c2}', 'consultation', 'C2 booking', 'pending');
  `);
});

const role = async (id) => (await db.query(`SELECT role FROM public.profiles WHERE id = '${id}'`)).rows[0].role;

// ── Role escalation ──────────────────────────────────────────────────────────
test("client cannot set role = admin", async () => {
  const e = await rejects(asUser(db, ids.c1, () =>
    db.exec(`UPDATE public.profiles SET role = 'admin' WHERE id = '${ids.c1}'`)));
  assert.match(e.message, /role can only be changed by an administrator/);
  assert.equal(await role(ids.c1), "client");
});

test("client cannot set role = staff", async () => {
  await rejects(asUser(db, ids.c1, () =>
    db.exec(`UPDATE public.profiles SET role = 'staff' WHERE id = '${ids.c1}'`)));
  assert.equal(await role(ids.c1), "client");
});

test("client can update their permitted profile fields", async () => {
  await asUser(db, ids.c1, () =>
    db.exec(`UPDATE public.profiles SET full_name = 'Client One', phone = '+256000', company_name = 'Acme', billing_address = 'Kampala', tax_id = 'T1' WHERE id = '${ids.c1}'`));
  const { rows } = await db.query(`SELECT full_name, phone FROM public.profiles WHERE id = '${ids.c1}'`);
  assert.equal(rows[0].full_name, "Client One");
});

test("client cannot change email, portal URL or archive flags", async () => {
  for (const set of [`email = 'evil@example.test'`, `external_portal_url = 'https://evil.test'`, `archived_at = now()`]) {
    await rejects(asUser(db, ids.c1, () =>
      db.exec(`UPDATE public.profiles SET ${set} WHERE id = '${ids.c1}'`)), set);
  }
});

test("client cannot change another client's profile", async () => {
  await asUser(db, ids.c1, () =>
    db.exec(`UPDATE public.profiles SET full_name = 'hacked' WHERE id = '${ids.c2}'`));
  const { rows } = await db.query(`SELECT full_name FROM public.profiles WHERE id = '${ids.c2}'`);
  assert.notEqual(rows[0].full_name, "hacked");
});

test("staff cannot change any role (own or another user's)", async () => {
  await rejects(asUser(db, ids.staff, () =>
    db.exec(`UPDATE public.profiles SET role = 'admin' WHERE id = '${ids.staff}'`)));
  await asUser(db, ids.staff, () =>
    db.exec(`UPDATE public.profiles SET role = 'admin' WHERE id = '${ids.c2}'`)); // no policy: 0 rows
  assert.equal(await role(ids.c2), "client");
  assert.equal(await role(ids.staff), "staff");
});

test("admin can change another user's role but not their own", async () => {
  await asUser(db, ids.admin, () =>
    db.exec(`UPDATE public.profiles SET role = 'staff' WHERE id = '${ids.c2}'`));
  assert.equal(await role(ids.c2), "staff");
  await asService(db, () => db.exec(`UPDATE public.profiles SET role = 'client' WHERE id = '${ids.c2}'`));
  const e = await rejects(asUser(db, ids.admin, () =>
    db.exec(`UPDATE public.profiles SET role = 'client' WHERE id = '${ids.admin}'`)));
  assert.match(e.message, /cannot change their own role/);
});

test("sign-up metadata cannot choose a role", async () => {
  await db.exec(`INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
    VALUES (gen_random_uuid(), 'meta@example.test', '{"role":"admin"}', '{"role":"admin"}')`);
  const { rows } = await db.query(`SELECT role FROM public.profiles WHERE email = 'meta@example.test'`);
  assert.equal(rows[0].role, "client");
});

// ── Client data isolation ────────────────────────────────────────────────────
test("client 1 sees only their own profile, project and milestones", async () => {
  const prof = await asUser(db, ids.c1, () => db.query(`SELECT id FROM public.profiles`));
  assert.deepEqual(prof.rows.map((r) => r.id), [ids.c1]);
  const proj = await asUser(db, ids.c1, () => db.query(`SELECT id FROM public.projects`));
  assert.deepEqual(proj.rows.map((r) => r.id), [P1]);
  const ms = await asUser(db, ids.c1, () => db.query(`SELECT id FROM public.project_milestones`));
  assert.equal(ms.rows.length, 2);
});

test("client cannot read another client's project by id", async () => {
  const r = await asUser(db, ids.c1, () => db.query(`SELECT id FROM public.projects WHERE id = '${P2}'`));
  assert.equal(r.rows.length, 0);
  const m = await asUser(db, ids.c1, () => db.query(`SELECT id FROM public.project_updates WHERE project_id = '${P2}'`));
  assert.equal(m.rows.length, 0);
});

test("client cannot read internal project updates (direct table access)", async () => {
  const r = await asUser(db, ids.c1, () => db.query(`SELECT content FROM public.project_updates ORDER BY content`));
  assert.deepEqual(r.rows.map((x) => x.content), ["visible note"]);
  const direct = await asUser(db, ids.c1, () =>
    db.query(`SELECT content FROM public.project_updates WHERE is_internal = true`));
  assert.equal(direct.rows.length, 0);
});

test("staff and admin still see internal updates", async () => {
  for (const uid of [ids.staff, ids.admin]) {
    const r = await asUser(db, uid, () => db.query(`SELECT content FROM public.project_updates WHERE project_id = '${P1}'`));
    assert.equal(r.rows.length, 2);
  }
});

test("client cannot post an internal update, or spoof another author", async () => {
  await rejects(asUser(db, ids.c1, () => db.exec(
    `INSERT INTO public.project_updates (project_id, author_id, content, is_internal) VALUES ('${P1}', '${ids.c1}', 'x', true)`)));
  await rejects(asUser(db, ids.c1, () => db.exec(
    `INSERT INTO public.project_updates (project_id, author_id, content) VALUES ('${P1}', '${ids.staff}', 'pretend staff')`)));
  await rejects(asUser(db, ids.c1, () => db.exec(
    `INSERT INTO public.project_updates (project_id, author_id, content) VALUES ('${P2}', '${ids.c1}', 'into another project')`)));
  await asUser(db, ids.c1, () => db.exec(
    `INSERT INTO public.project_updates (project_id, author_id, content) VALUES ('${P1}', '${ids.c1}', 'my comment')`));
});

test("client sees only visible deliverables of their own project", async () => {
  const r = await asUser(db, ids.c1, () => db.query(`SELECT name FROM public.deliverables ORDER BY name`));
  assert.deepEqual(r.rows.map((x) => x.name), ["visible.pdf"]);
  const hidden = await asUser(db, ids.c1, () =>
    db.query(`SELECT id FROM public.deliverables WHERE id = '30000000-0000-0000-0000-000000000002'`));
  assert.equal(hidden.rows.length, 0);
  const other = await asUser(db, ids.c1, () =>
    db.query(`SELECT id FROM public.deliverables WHERE id = '30000000-0000-0000-0000-000000000003'`));
  assert.equal(other.rows.length, 0);
});

test("staff can see hidden deliverables", async () => {
  const r = await asUser(db, ids.staff, () => db.query(`SELECT id FROM public.deliverables`));
  assert.equal(r.rows.length, 3);
});

// ── Milestones and bookings: clients can respond, not edit ───────────────────
test("client can approve a submitted milestone but change nothing else", async () => {
  const sub = "20000000-0000-0000-0000-000000000001";
  const pend = "20000000-0000-0000-0000-000000000002";
  await rejects(asUser(db, ids.c1, () => db.exec(`UPDATE public.project_milestones SET weight_percent = 100 WHERE id = '${sub}'`)));
  await rejects(asUser(db, ids.c1, () => db.exec(`UPDATE public.project_milestones SET title = 'renamed' WHERE id = '${sub}'`)));
  await rejects(asUser(db, ids.c1, () => db.exec(`UPDATE public.project_milestones SET status = 'approved' WHERE id = '${pend}'`)));
  await rejects(asUser(db, ids.c1, () => db.exec(`UPDATE public.project_milestones SET status = 'pending' WHERE id = '${sub}'`)));
  await asUser(db, ids.c1, () => db.exec(`UPDATE public.project_milestones SET status = 'approved', completed_at = now() WHERE id = '${sub}'`));
  const r = await db.query(`SELECT status FROM public.project_milestones WHERE id = '${sub}'`);
  assert.equal(r.rows[0].status, "approved");
});

test("client cannot touch another client's milestone", async () => {
  await db.exec(`INSERT INTO public.project_milestones (id, project_id, title, status) VALUES ('20000000-0000-0000-0000-000000000009', '${P2}', 'other', 'submitted')`);
  await asUser(db, ids.c1, () => db.exec(`UPDATE public.project_milestones SET status = 'approved' WHERE id = '20000000-0000-0000-0000-000000000009'`));
  const r = await db.query(`SELECT status FROM public.project_milestones WHERE id = '20000000-0000-0000-0000-000000000009'`);
  assert.equal(r.rows[0].status, "submitted");
});

test("client can create a pending booking and cancel it, nothing more", async () => {
  await rejects(asUser(db, ids.c1, () => db.exec(
    `INSERT INTO public.bookings (client_id, type, title, status) VALUES ('${ids.c1}', 'consultation', 'self-confirmed', 'confirmed')`)));
  await rejects(asUser(db, ids.c1, () => db.exec(
    `INSERT INTO public.bookings (client_id, type, title) VALUES ('${ids.c2}', 'consultation', 'for someone else')`)));
  const b = "40000000-0000-0000-0000-000000000001";
  await rejects(asUser(db, ids.c1, () => db.exec(`UPDATE public.bookings SET status = 'confirmed' WHERE id = '${b}'`)));
  await rejects(asUser(db, ids.c1, () => db.exec(`UPDATE public.bookings SET title = 'renamed' WHERE id = '${b}'`)));
  await asUser(db, ids.c1, () => db.exec(`UPDATE public.bookings SET status = 'cancelled' WHERE id = '${b}'`));
  const r = await db.query(`SELECT status FROM public.bookings WHERE id = '${b}'`);
  assert.equal(r.rows[0].status, "cancelled");
});

test("client cannot see or change another client's booking", async () => {
  const r = await asUser(db, ids.c1, () => db.query(`SELECT id FROM public.bookings WHERE client_id = '${ids.c2}'`));
  assert.equal(r.rows.length, 0);
  await asUser(db, ids.c1, () => db.exec(`UPDATE public.bookings SET status = 'cancelled' WHERE id = '40000000-0000-0000-0000-000000000002'`));
  const s = await db.query(`SELECT status FROM public.bookings WHERE id = '40000000-0000-0000-0000-000000000002'`);
  assert.equal(s.rows[0].status, "pending");
});

// ── Staff vs admin ───────────────────────────────────────────────────────────
test("staff cannot create, update or delete invoices, line items or payments", async () => {
  await rejects(asUser(db, ids.staff, () => db.exec(
    `INSERT INTO public.invoices (client_id) VALUES ('${ids.c1}')`)), "staff create invoice");
  await asService(db, () => db.exec(`INSERT INTO public.invoices (id, client_id, status, tax_rate) VALUES ('50000000-0000-0000-0000-000000000001', '${ids.c1}', 'draft', 0)`));
  await asUser(db, ids.staff, () => db.exec(`UPDATE public.invoices SET notes = 'x' WHERE id = '50000000-0000-0000-0000-000000000001'`));
  await asUser(db, ids.staff, () => db.exec(`DELETE FROM public.invoices WHERE id = '50000000-0000-0000-0000-000000000001'`));
  const still = await db.query(`SELECT notes FROM public.invoices WHERE id = '50000000-0000-0000-0000-000000000001'`);
  assert.equal(still.rows.length, 1, "staff delete must be a no-op");
  assert.equal(still.rows[0].notes, null, "staff update must be a no-op");
  await rejects(asUser(db, ids.staff, () => db.exec(
    `INSERT INTO public.invoice_line_items (invoice_id, description, quantity, unit_price) VALUES ('50000000-0000-0000-0000-000000000001', 'x', 1, 10)`)), "staff line item");
  await rejects(asUser(db, ids.staff, () => db.exec(
    `INSERT INTO public.payments (invoice_id, amount, method) VALUES ('50000000-0000-0000-0000-000000000001', 5, 'cash')`)), "staff payment");
});

test("staff cannot delete or update a payment, or delete a client", async () => {
  const inv = "50000000-0000-0000-0000-0000000000f1";
  await asService(db, () => db.exec(`
    INSERT INTO public.invoices (id, client_id, status) VALUES ('${inv}', '${ids.c1}', 'draft');
    INSERT INTO public.invoice_line_items (invoice_id, description, quantity, unit_price) VALUES ('${inv}', 'work', 1, 100);
    UPDATE public.invoices SET status = 'sent' WHERE id = '${inv}';
    INSERT INTO public.payments (id, invoice_id, amount, method, paid_at) VALUES ('60000000-0000-0000-0000-0000000000f1', '${inv}', 40, 'cash', now());`));
  await asUser(db, ids.staff, () => db.exec(`DELETE FROM public.payments WHERE id = '60000000-0000-0000-0000-0000000000f1'`));
  await asUser(db, ids.staff, () => db.exec(`UPDATE public.payments SET amount = 1 WHERE id = '60000000-0000-0000-0000-0000000000f1'`));
  const p = await db.query(`SELECT amount FROM public.payments WHERE id = '60000000-0000-0000-0000-0000000000f1'`);
  assert.equal(Number(p.rows[0].amount), 40);
  await asUser(db, ids.staff, () => db.exec(`DELETE FROM public.profiles WHERE id = '${ids.c1}'`)); // no delete policy
  assert.equal((await db.query(`SELECT 1 FROM public.profiles WHERE id = '${ids.c1}'`)).rows.length, 1);
});

test("admin can still manage invoices and record payments, and nobody deletes payments", async () => {
  await asUser(db, ids.admin, () => db.exec(`INSERT INTO public.invoices (id, client_id) VALUES ('50000000-0000-0000-0000-0000000000a1', '${ids.c1}')`));
  await asUser(db, ids.admin, () => db.exec(`INSERT INTO public.invoice_line_items (invoice_id, description, quantity, unit_price) VALUES ('50000000-0000-0000-0000-0000000000a1', 'x', 2, 25)`));
  await asUser(db, ids.admin, () => db.exec(`DELETE FROM public.payments WHERE id = '60000000-0000-0000-0000-0000000000f1'`)); // no policy: 0 rows
  assert.equal((await db.query(`SELECT 1 FROM public.payments WHERE id = '60000000-0000-0000-0000-0000000000f1'`)).rows.length, 1);
});

test("staff cannot write academy courses; admin can", async () => {
  await rejects(asUser(db, ids.staff, () => db.exec(`INSERT INTO public.academy_courses (name) VALUES ('c')`)));
  await asUser(db, ids.admin, () => db.exec(`INSERT INTO public.academy_courses (name) VALUES ('c')`));
});

// ── Finance visibility for clients ───────────────────────────────────────────
test("client cannot see draft invoices, or another client's invoices, items, payments and receipts", async () => {
  const c2inv = "50000000-0000-0000-0000-0000000000c2";
  await asService(db, () => db.exec(`
    INSERT INTO public.invoices (id, client_id, status) VALUES ('${c2inv}', '${ids.c2}', 'draft');
    INSERT INTO public.invoice_line_items (invoice_id, description, quantity, unit_price) VALUES ('${c2inv}', 'c2 work', 1, 500);
    UPDATE public.invoices SET status = 'sent' WHERE id = '${c2inv}';
    INSERT INTO public.payments (id, invoice_id, amount, method, paid_at) VALUES ('60000000-0000-0000-0000-0000000000c2', '${c2inv}', 100, 'cash', now());`));
  const inv = await asUser(db, ids.c1, () => db.query(`SELECT id, status FROM public.invoices`));
  assert.ok(inv.rows.every((r) => r.status !== "draft"), "client must not see drafts");
  assert.ok(!inv.rows.some((r) => r.id === c2inv), "client must not see another client's invoice");
  const items = await asUser(db, ids.c1, () => db.query(`SELECT 1 FROM public.invoice_line_items WHERE invoice_id = '${c2inv}'`));
  const pay = await asUser(db, ids.c1, () => db.query(`SELECT 1 FROM public.payments WHERE invoice_id = '${c2inv}'`));
  const rec = await asUser(db, ids.c1, () => db.query(`SELECT 1 FROM public.receipts WHERE invoice_id = '${c2inv}'`));
  assert.equal(items.rows.length + pay.rows.length + rec.rows.length, 0);
  // the draft that belongs to client 1 is also hidden
  const draft = await asUser(db, ids.c1, () => db.query(`SELECT 1 FROM public.invoices WHERE id = '50000000-0000-0000-0000-0000000000a1'`));
  assert.equal(draft.rows.length, 0);
});

test("client sees their own settled payments and receipts but not pending payment attempts", async () => {
  const inv = "50000000-0000-0000-0000-0000000000f1";
  await asService(db, () => db.exec(`INSERT INTO public.payments (id, invoice_id, amount, method, paystack_reference) VALUES ('60000000-0000-0000-0000-0000000000f2', '${inv}', 10, 'paystack', 'ref-pending-1')`));
  const pay = await asUser(db, ids.c1, () => db.query(`SELECT id FROM public.payments WHERE invoice_id = '${inv}'`));
  assert.deepEqual(pay.rows.map((r) => r.id), ["60000000-0000-0000-0000-0000000000f1"]);
  const rec = await asUser(db, ids.c1, () => db.query(`SELECT 1 FROM public.receipts WHERE invoice_id = '${inv}'`));
  assert.equal(rec.rows.length, 1);
});

// ── Audit log ────────────────────────────────────────────────────────────────
test("audit_logs: only admins can read; nobody can edit or delete", async () => {
  const asAdmin = await asUser(db, ids.admin, () => db.query(`SELECT count(*)::int AS n FROM public.audit_logs`));
  assert.ok(asAdmin.rows[0].n > 0);
  for (const uid of [ids.staff, ids.c1]) {
    const r = await asUser(db, uid, () => db.query(`SELECT * FROM public.audit_logs`));
    assert.equal(r.rows.length, 0);
    await rejects(asUser(db, uid, () => db.exec(`INSERT INTO public.audit_logs (action) VALUES ('forged')`)));
  }
  await rejects(asService(db, () => db.exec(`DELETE FROM public.audit_logs`)));
  await rejects(asService(db, () => db.exec(`UPDATE public.audit_logs SET action = 'x'`)));
});

test("audit_logs records role changes", async () => {
  const before = (await db.query(`SELECT count(*)::int AS n FROM public.audit_logs WHERE action = 'profile.role_changed'`)).rows[0].n;
  await asUser(db, ids.admin, () => db.exec(`UPDATE public.profiles SET role = 'staff' WHERE id = '${ids.c2}'`));
  const { rows } = await db.query(`SELECT actor_id, actor_role, old_data, new_data, record_id FROM public.audit_logs WHERE action = 'profile.role_changed' ORDER BY created_at DESC, id DESC LIMIT 1`);
  assert.equal(rows[0].actor_id, ids.admin);
  assert.equal(rows[0].actor_role, "admin");
  assert.equal(rows[0].record_id, ids.c2);
  assert.deepEqual(rows[0].new_data, { role: "staff" });
  const after = (await db.query(`SELECT count(*)::int AS n FROM public.audit_logs WHERE action = 'profile.role_changed'`)).rows[0].n;
  assert.equal(after, before + 1);
  await asService(db, () => db.exec(`UPDATE public.profiles SET role = 'client' WHERE id = '${ids.c2}'`));
});

test("archiving a profile is logged", async () => {
  await asService(db, () => db.exec(`UPDATE public.profiles SET archived_at = now() WHERE id = '${ids.c2}'`));
  const { rows } = await db.query(`SELECT 1 FROM public.audit_logs WHERE action = 'profile.archived' AND record_id = '${ids.c2}'`);
  assert.equal(rows.length, 1);
  await asService(db, () => db.exec(`UPDATE public.profiles SET archived_at = NULL WHERE id = '${ids.c2}'`));
});

test("an archived admin loses admin privileges at the database", async () => {
  await asService(db, () => db.exec(`UPDATE public.profiles SET archived_at = now() WHERE id = '${ids.staff}'`));
  const r = await asUser(db, ids.staff, () => db.query(`SELECT id FROM public.projects`));
  assert.equal(r.rows.length, 0, "archived staff no longer pass is_staff()");
  await asService(db, () => db.exec(`UPDATE public.profiles SET archived_at = NULL WHERE id = '${ids.staff}'`));
});
