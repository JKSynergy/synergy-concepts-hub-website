// Evidence for the audit findings: migrations 001-009 ALONE (before the Phase 1
// migration) allow these things. This file documents the CONFIRMED status of
// each finding and proves the harness detects the problem; the remediation is
// tested in security-rls.test.mjs and finance-integrity.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { createDb, seed, asUser } from "./helpers/db.mjs";

const PRE = "009_fix_partial_payment_trigger.sql";

test("BEFORE 010: a client can make themselves admin (finding R1)", async () => {
  const db = await createDb({ upTo: PRE });
  const ids = await seed(db);
  await asUser(db, ids.c1, () => db.exec(`UPDATE public.profiles SET role = 'admin' WHERE id = '${ids.c1}'`));
  const { rows } = await db.query(`SELECT role FROM public.profiles WHERE id = '${ids.c1}'`);
  assert.equal(rows[0].role, "admin");
});

test("BEFORE 010: sign-up metadata chooses the role (finding R2)", async () => {
  const db = await createDb({ upTo: PRE });
  await db.exec(`INSERT INTO auth.users (id, email, raw_user_meta_data)
                 VALUES (gen_random_uuid(), 'x@example.test', '{"role":"admin"}')`);
  const { rows } = await db.query(`SELECT role FROM public.profiles WHERE email = 'x@example.test'`);
  assert.equal(rows[0].role, "admin");
});

test("BEFORE 010: a client can read internal notes and hidden deliverables (finding R5)", async () => {
  const db = await createDb({ upTo: PRE });
  const ids = await seed(db);
  await db.exec(`
    INSERT INTO public.projects (id, client_id, title) VALUES ('10000000-0000-0000-0000-000000000001', '${ids.c1}', 'P1');
    INSERT INTO public.project_updates (project_id, author_id, content, is_internal)
      VALUES ('10000000-0000-0000-0000-000000000001', '${ids.staff}', 'internal only', true);
    INSERT INTO public.deliverables (project_id, name, is_visible_to_client)
      VALUES ('10000000-0000-0000-0000-000000000001', 'hidden.zip', false);`);
  const upd = await asUser(db, ids.c1, () => db.query(`SELECT content FROM public.project_updates`));
  const del = await asUser(db, ids.c1, () => db.query(`SELECT name FROM public.deliverables`));
  assert.equal(upd.rows.length, 1);
  assert.equal(del.rows.length, 1);
});

test("BEFORE 010: staff can write invoices and payments (finding R7)", async () => {
  const db = await createDb({ upTo: PRE });
  const ids = await seed(db);
  await asUser(db, ids.staff, () =>
    db.exec(`INSERT INTO public.invoices (client_id, invoice_number) VALUES ('${ids.c1}', 'SCH-2026-9999')`));
  const { rows } = await db.query(`SELECT count(*)::int AS n FROM public.invoices`);
  assert.equal(rows[0].n, 1);
});
