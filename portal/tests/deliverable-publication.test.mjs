import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDb, asUser, asService, rejects } from "./helpers/db.mjs";

const ADMIN = "00000000-0000-0000-0000-0000000000a1";
const STAFF = "00000000-0000-0000-0000-0000000000b1";
const ARCHIVED = "00000000-0000-0000-0000-0000000000b2";
const FINANCE = "00000000-0000-0000-0000-0000000000f1";
const CLIENT_A = "00000000-0000-0000-0000-0000000000c1";
const CLIENT_B = "00000000-0000-0000-0000-0000000000c2";
const PROJECT_A = "10000000-0000-0000-0000-000000000001";
const PROJECT_B = "10000000-0000-0000-0000-000000000002";
const HIDDEN = "30000000-0000-0000-0000-000000000001";
const VISIBLE = "30000000-0000-0000-0000-000000000002";

async function setup(db) {
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${ADMIN}', 'admin@example.test'), ('${STAFF}', 'staff@example.test'),
      ('${ARCHIVED}', 'archived@example.test'), ('${FINANCE}', 'finance@example.test'),
      ('${CLIENT_A}', 'a@example.test'), ('${CLIENT_B}', 'b@example.test');
    INSERT INTO public.profiles (id, email, role, archived_at) VALUES
      ('${ADMIN}', 'admin@example.test', 'admin', NULL),
      ('${STAFF}', 'staff@example.test', 'staff', NULL),
      ('${ARCHIVED}', 'archived@example.test', 'staff', now()),
      ('${FINANCE}', 'finance@example.test', 'finance', NULL),
      ('${CLIENT_A}', 'a@example.test', 'client', NULL),
      ('${CLIENT_B}', 'b@example.test', 'client', NULL)
    ON CONFLICT (id) DO UPDATE SET
      role = EXCLUDED.role,
      archived_at = EXCLUDED.archived_at;
    INSERT INTO public.projects (id, client_id, title) VALUES
      ('${PROJECT_A}', '${CLIENT_A}', 'Client A project'),
      ('${PROJECT_B}', '${CLIENT_B}', 'Client B project');
    INSERT INTO public.deliverables
      (id, project_id, name, file_url, file_type, file_size_bytes, is_visible_to_client)
    VALUES
      ('${HIDDEN}', '${PROJECT_A}', 'Hidden proof', '${PROJECT_A}/hidden.pdf', 'application/pdf', 123, false),
      ('${VISIBLE}', '${PROJECT_A}', 'Visible proof', '${PROJECT_A}/visible.pdf', 'application/pdf', 456, true);
  `);
}

const setVisibility = (db, userId, deliverableId, projectId, visible) =>
  asUser(db, userId, async () =>
    (await db.query(`SELECT public.set_deliverable_visibility(
      '${deliverableId}'::uuid, '${projectId}'::uuid, ${visible}
    ) AS result`)).rows[0].result);

const row = async (db, id) =>
  (await db.query(`SELECT * FROM public.deliverables WHERE id='${id}'`)).rows[0];

test("admin publishes and unpublishes while preserving all other metadata", async () => {
  const db = await createDb();
  await setup(db);
  const before = await row(db, HIDDEN);

  const published = await setVisibility(db, ADMIN, HIDDEN, PROJECT_A, true);
  assert.deepEqual(published, {
    changed: true,
    deliverable_id: HIDDEN,
    project_id: PROJECT_A,
    previous_visibility: false,
    visibility: true,
  });
  const afterPublish = await row(db, HIDDEN);
  assert.equal(afterPublish.is_visible_to_client, true);
  for (const key of ["id", "project_id", "name", "file_url", "file_type", "file_size_bytes", "created_at"]) {
    assert.deepEqual(afterPublish[key], before[key], key);
  }

  const unpublished = await setVisibility(db, ADMIN, HIDDEN, PROJECT_A, false);
  assert.equal(unpublished.changed, true);
  assert.equal(unpublished.previous_visibility, true);
  assert.equal(unpublished.visibility, false);
  assert.equal((await row(db, HIDDEN)).is_visible_to_client, false);
});

test("active operational staff may publish; finance, clients, archived staff, and anonymous are denied", async () => {
  const db = await createDb();
  await setup(db);
  assert.equal((await setVisibility(db, STAFF, HIDDEN, PROJECT_A, true)).changed, true);

  for (const actor of [FINANCE, CLIENT_A, ARCHIVED]) {
    const error = await rejects(setVisibility(db, actor, VISIBLE, PROJECT_A, false));
    assert.match(error.message, /Only active administrators or staff|insufficient privilege/i);
  }

  await db.exec("SET ROLE anon");
  try {
    const error = await rejects(db.query(`SELECT public.set_deliverable_visibility('${VISIBLE}', '${PROJECT_A}', false)`));
    assert.match(error.message, /permission denied/i);
  } finally {
    await db.exec("RESET ROLE");
  }
  assert.equal((await row(db, VISIBLE)).is_visible_to_client, true);
});

test("cross-project pair is rejected without changing or auditing the deliverable", async () => {
  const db = await createDb();
  await setup(db);
  const result = await setVisibility(db, ADMIN, HIDDEN, PROJECT_B, true);
  assert.equal(result.changed, false);
  assert.equal(result.reason, "not_found");
  assert.equal((await row(db, HIDDEN)).is_visible_to_client, false);
  const audit = await db.query(`SELECT id FROM public.audit_logs WHERE record_id='${HIDDEN}'`);
  assert.equal(audit.rows.length, 0);
});

test("repeated requests are idempotent and audit only real transitions", async () => {
  const db = await createDb();
  await setup(db);
  const first = await setVisibility(db, STAFF, HIDDEN, PROJECT_A, true);
  const repeat = await setVisibility(db, STAFF, HIDDEN, PROJECT_A, true);
  assert.equal(first.changed, true);
  assert.equal(repeat.changed, false);
  assert.equal(repeat.reason, "already_set");

  const { rows } = await db.query(`
    SELECT actor_id, actor_role, action, table_name, record_id, old_data, new_data, details
    FROM public.audit_logs WHERE record_id='${HIDDEN}' ORDER BY created_at
  `);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actor_id, STAFF);
  assert.equal(rows[0].actor_role, "staff");
  assert.equal(rows[0].action, "deliverable.published");
  assert.equal(rows[0].table_name, "deliverables");
  assert.equal(rows[0].old_data.is_visible_to_client, false);
  assert.equal(rows[0].new_data.is_visible_to_client, true);
  assert.equal(rows[0].details.project_id, PROJECT_A);
  assert.equal(rows[0].details.deliverable_id, HIDDEN);
  assert.equal(JSON.stringify(rows[0]).includes("token"), false);
});

test("audit failure rolls back the visibility transition", async () => {
  const db = await createDb();
  await setup(db);
  await db.exec(`
    CREATE FUNCTION public.fail_deliverable_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.action IN ('deliverable.published', 'deliverable.unpublished') THEN
        RAISE EXCEPTION 'forced audit failure';
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER fail_deliverable_audit BEFORE INSERT ON public.audit_logs
      FOR EACH ROW EXECUTE FUNCTION public.fail_deliverable_audit();
  `);
  const error = await rejects(setVisibility(db, ADMIN, HIDDEN, PROJECT_A, true));
  assert.match(error.message, /forced audit failure/);
  assert.equal((await row(db, HIDDEN)).is_visible_to_client, false);
});

test("direct authenticated updates are denied, including unrelated metadata", async () => {
  const db = await createDb();
  await setup(db);
  for (const sql of [
    `UPDATE public.deliverables SET name='tampered' WHERE id='${HIDDEN}'`,
    `UPDATE public.deliverables SET is_visible_to_client=true WHERE id='${HIDDEN}'`,
  ]) {
    const error = await rejects(asUser(db, STAFF, () => db.exec(sql)));
    assert.match(error.message, /permission denied|row-level security/i);
  }
  const current = await row(db, HIDDEN);
  assert.equal(current.name, "Hidden proof");
  assert.equal(current.is_visible_to_client, false);
});

test("client RLS follows publication state and never exposes another client's deliverable", async () => {
  const db = await createDb();
  await setup(db);
  let visible = await asUser(db, CLIENT_A, () => db.query("SELECT id FROM public.deliverables ORDER BY id"));
  assert.deepEqual(visible.rows.map((x) => x.id), [VISIBLE]);

  await setVisibility(db, ADMIN, HIDDEN, PROJECT_A, true);
  visible = await asUser(db, CLIENT_A, () => db.query("SELECT id FROM public.deliverables ORDER BY id"));
  assert.deepEqual(visible.rows.map((x) => x.id), [HIDDEN, VISIBLE]);
  const other = await asUser(db, CLIENT_B, () => db.query("SELECT id FROM public.deliverables ORDER BY id"));
  assert.equal(other.rows.length, 0);

  await setVisibility(db, STAFF, HIDDEN, PROJECT_A, false);
  visible = await asUser(db, CLIENT_A, () => db.query("SELECT id FROM public.deliverables ORDER BY id"));
  assert.deepEqual(visible.rows.map((x) => x.id), [VISIBLE]);
});

test("row locking and explicit desired state provide deterministic serialized transitions", async () => {
  const migration = readFileSync(new URL("../supabase/migrations/036_deliverable_publication.sql", import.meta.url), "utf8");
  assert.match(migration, /WHERE id = p_deliverable_id\s+FOR UPDATE/);
  const db = await createDb();
  await setup(db);
  assert.equal((await setVisibility(db, ADMIN, HIDDEN, PROJECT_A, true)).visibility, true);
  assert.equal((await setVisibility(db, STAFF, HIDDEN, PROJECT_A, false)).visibility, false);
  assert.equal((await row(db, HIDDEN)).is_visible_to_client, false);
});

test("RPC ACL and application/UI contracts are fail-closed", async () => {
  const db = await createDb();
  const acl = (await db.query(`
    SELECT
      has_function_privilege('anon', 'public.set_deliverable_visibility(uuid,uuid,boolean)', 'EXECUTE') anon_exec,
      has_function_privilege('authenticated', 'public.set_deliverable_visibility(uuid,uuid,boolean)', 'EXECUTE') auth_exec,
      has_function_privilege('service_role', 'public.set_deliverable_visibility(uuid,uuid,boolean)', 'EXECUTE') service_exec
  `)).rows[0];
  assert.deepEqual(acl, { anon_exec: false, auth_exec: true, service_exec: false });

  const actions = readFileSync(new URL("../lib/actions/projects.ts", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../components/deliverables-section.tsx", import.meta.url), "utf8");
  const adminPage = readFileSync(new URL("../app/admin/projects/[id]/page.tsx", import.meta.url), "utf8");
  const clientPage = readFileSync(new URL("../app/client/projects/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(actions, /setDeliverableVisibility[\s\S]*?!user \|\| !isStaff[\s\S]*?set_deliverable_visibility/);
  assert.match(actions, /revalidatePath\(`\/admin\/projects\/\$\{projectId\}`\)/);
  assert.match(actions, /revalidatePath\(`\/client\/projects\/\$\{projectId\}`\)/);
  assert.match(ui, /data-action=\{d\.is_visible_to_client \? "unpublish-deliverable" : "publish-deliverable"\}/);
  assert.match(ui, /Previously issued links may remain valid for up to five minutes/);
  assert.match(ui, /if \(!ok\) return/);
  assert.match(adminPage, /canPublish=\{canPublishDeliverables\(profile\.role\)\}/);
  assert.match(clientPage, /canPublish=\{false\}/);
});
