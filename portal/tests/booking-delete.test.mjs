// Booking deletion (migration 034).
// Covers delete_booking_admin: admin-only enforcement at function and RLS
// level, atomic delete + audit, dependency blocking on linked projects,
// missing-record/concurrent handling, and that cancel/complete paths are
// untouched. PGlite harness — callers run through asUser/asService exactly as
// the app does (authenticated JWT -> RPC; service_role -> fixtures).

import test from "node:test";
import assert from "node:assert/strict";
import { createDb, asUser, asService, rejects } from "./helpers/db.mjs";

const ADMIN = "00000000-0000-0000-0000-0000000000a1";
const STAFF = "00000000-0000-0000-0000-0000000000b1";
const FINANCE = "00000000-0000-0000-0000-0000000000f1";
const CLIENT = "00000000-0000-0000-0000-0000000000c1";

async function setup(db) {
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${ADMIN}', 'admin@example.test'), ('${STAFF}', 'staff@example.test'),
      ('${FINANCE}', 'finance@example.test'), ('${CLIENT}', 'client@example.test')
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.profiles (id, email, role) VALUES
      ('${ADMIN}', 'admin@example.test', 'admin'), ('${STAFF}', 'staff@example.test', 'staff'),
      ('${FINANCE}', 'finance@example.test', 'finance'), ('${CLIENT}', 'client@example.test', 'client')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  `);
}

async function addBooking(db, { status = "pending", clientId = CLIENT } = {}) {
  const { rows } = await asService(db, () =>
    db.query(
      `INSERT INTO public.bookings (client_id, type, title, status, scheduled_at)
       VALUES (${clientId ? `'${clientId}'` : "NULL"}, 'consultation', 'Site walkthrough', '${status}', now() + interval '3 days')
       RETURNING id`
    ));
  return rows[0].id;
}

const del = (db, userId, id) =>
  asUser(db, userId, async () =>
    (await db.query(`SELECT public.delete_booking_admin('${id}'::uuid) AS r`)).rows[0].r);
const delService = (db, id, actorId) =>
  asService(db, async () => {
    await db.exec(`SELECT set_config('request.jwt.claim.sub', '${actorId}', false)`);
    return (await db.query(`SELECT public.delete_booking_admin('${id}'::uuid) AS r`)).rows[0].r;
  });
const exists = async (db, id) =>
  (await db.query(`SELECT count(*)::int AS n FROM public.bookings WHERE id='${id}'`)).rows[0].n === 1;

test("admin can delete an eligible booking; row gone and audit written", async () => {
  const db = await createDb();
  await setup(db);
  const id = await addBooking(db);

  const res = await del(db, ADMIN, id);
  assert.equal(res.deleted, 1);
  assert.equal(await exists(db, id), false);

  const { rows } = await db.query(
    `SELECT actor_id, actor_role, action, table_name, record_id, old_data
     FROM public.audit_logs WHERE record_id='${id}' AND action='booking.deleted'`
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actor_id, ADMIN);
  assert.equal(rows[0].actor_role, "admin");
  assert.equal(rows[0].table_name, "bookings");
  assert.equal(rows[0].old_data.title, "Site walkthrough");
});

test("staff cannot delete via RPC — insufficient_privilege, row intact", async () => {
  const db = await createDb();
  await setup(db);
  const id = await addBooking(db);

  const e = await rejects(del(db, STAFF, id), "staff delete");
  assert.match(e.message, /administrator|insufficient_privilege/i);
  assert.equal(await exists(db, id), true);
});

test("staff cannot delete via direct table access — RLS blocks", async () => {
  const db = await createDb();
  await setup(db);
  const id = await addBooking(db);

  // RLS USING false on DELETE silently filters: statement runs, 0 rows removed.
  const { affectedRows } = await asUser(db, STAFF, () =>
    db.query(`DELETE FROM public.bookings WHERE id='${id}'`));
  assert.equal(affectedRows ?? 0, 0);
  assert.equal(await exists(db, id), true);
});

test("finance cannot delete via RPC or table access", async () => {
  const db = await createDb();
  await setup(db);
  const id = await addBooking(db);

  const e = await rejects(del(db, FINANCE, id), "finance delete");
  assert.match(e.message, /administrator|insufficient_privilege/i);
  await asUser(db, FINANCE, () => db.query(`DELETE FROM public.bookings WHERE id='${id}'`));
  assert.equal(await exists(db, id), true);
});

test("client cannot delete own or others' bookings", async () => {
  const db = await createDb();
  await setup(db);
  const own = await addBooking(db, { clientId: CLIENT });
  const other = await addBooking(db, { clientId: null });

  await rejects(del(db, CLIENT, own), "client rpc delete");
  await asUser(db, CLIENT, () => db.query(`DELETE FROM public.bookings WHERE id IN ('${own}','${other}')`));
  assert.equal(await exists(db, own), true);
  assert.equal(await exists(db, other), true);
});

test("anonymous callers cannot execute the function at all", async () => {
  const db = await createDb();
  await setup(db);
  const id = await addBooking(db);

  const e = await rejects(
    (async () => {
      await db.exec("SET ROLE anon; SELECT set_config('request.jwt.claim.sub', '', false)");
      try {
        await db.query(`SELECT public.delete_booking_admin('${id}'::uuid)`);
      } finally {
        await db.exec("RESET ROLE");
      }
    })(),
    "anon delete"
  );
  assert.match(e.message, /permission denied|execute/i);
  assert.equal(await exists(db, id), true);
});

test("booking linked to a project is blocked; both rows intact", async () => {
  const db = await createDb();
  await setup(db);
  const id = await addBooking(db, { status: "completed" });
  await asService(db, () =>
    db.query(`INSERT INTO public.projects (client_id, booking_id, title, status)
              VALUES ('${CLIENT}', '${id}', 'Converted site build', 'active')`));

  const res = await del(db, ADMIN, id);
  assert.equal(res.deleted, 0);
  assert.equal(res.reason, "linked_project");
  assert.equal(res.linked_projects, 1);
  assert.equal(await exists(db, id), true);
  // The project still points at the booking — no SET NULL damage.
  const { rows } = await db.query(`SELECT booking_id FROM public.projects WHERE booking_id='${id}'`);
  assert.equal(rows.length, 1);
  // No audit row for a blocked attempt.
  const { rows: audit } = await db.query(`SELECT 1 FROM public.audit_logs WHERE record_id='${id}'`);
  assert.equal(audit.length, 0);
});

test("missing booking returns not_found; double delete is an honest no-op", async () => {
  const db = await createDb();
  await setup(db);
  const id = await addBooking(db);

  const first = await del(db, ADMIN, id);
  assert.equal(first.deleted, 1);

  // Second call (concurrent loser or retry) sees the row gone — clean reason.
  const second = await del(db, ADMIN, id);
  assert.equal(second.deleted, 0);
  assert.equal(second.reason, "not_found");

  const never = await del(db, ADMIN, "00000000-0000-0000-0000-000000000099");
  assert.equal(never.reason, "not_found");
});

test("service-role caller has no EXECUTE privilege (fail-closed)", async () => {
  const db = await createDb();
  await setup(db);
  const id = await addBooking(db);

  // EXECUTE is granted to authenticated only; service_role is rejected at the
  // privilege layer before the function body even runs.
  const e = await rejects(delService(db, id, ""), "service-role delete");
  assert.match(e.message, /permission denied/i);
  assert.equal(await exists(db, id), true);
});

test("cancel and complete still work for staff after delete policy change", async () => {
  const db = await createDb();
  await setup(db);
  const id = await addBooking(db, { status: "confirmed" });

  await asUser(db, STAFF, () =>
    db.query(`UPDATE public.bookings SET status='completed' WHERE id='${id}'`));
  assert.equal(
    (await db.query(`SELECT status FROM public.bookings WHERE id='${id}'`)).rows[0].status,
    "completed"
  );

  const id2 = await addBooking(db, { status: "pending" });
  await asUser(db, STAFF, () =>
    db.query(`UPDATE public.bookings SET status='cancelled' WHERE id='${id2}'`));
  assert.equal(
    (await db.query(`SELECT status FROM public.bookings WHERE id='${id2}'`)).rows[0].status,
    "cancelled"
  );
});
