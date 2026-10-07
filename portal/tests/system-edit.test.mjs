import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createDb, asUser, asService, rejects, seed } from "./helpers/db.mjs";

// updateSystem() edits registry metadata (name, client, type, status, URL,
// description) through the admin-guarded server action. These tests prove the
// database-level invariants the action relies on: RLS blocks non-staff writes,
// CHECK constraints reject invalid enum values, the client-integrity trigger
// blocks cross-client transfer when resources are attached, and identity /
// token / infrastructure columns are untouched by a metadata update.

const IDS = {
  admin: "11111111-1111-1111-1111-111111111111",
  staff: "11111111-1111-1111-1111-111111111112",
  c1: "22222222-2222-2222-2222-222222222221",
  c2: "22222222-2222-2222-2222-222222222222",
  systemA: "33333333-3333-3333-3333-333333333333",
  provider: "55555555-5555-5555-5555-555555555551",
  account: "55555555-5555-5555-5555-555555555552",
  resource: "55555555-5555-5555-5555-555555555553",
};

async function seedSystem(db, { withResource = false } = {}) {
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${IDS.admin}', 'admin@example.test'),
      ('${IDS.staff}', 'staff@example.test'),
      ('${IDS.c1}', 'client1@example.test'),
      ('${IDS.c2}', 'client2@example.test');
    UPDATE public.profiles SET role = 'admin' WHERE id = '${IDS.admin}';
    UPDATE public.profiles SET role = 'staff' WHERE id = '${IDS.staff}';
    UPDATE public.profiles SET role = 'client' WHERE id IN ('${IDS.c1}', '${IDS.c2}');

    INSERT INTO public.systems (id, client_id, name, system_type, status, primary_url, description)
    VALUES ('${IDS.systemA}', '${IDS.c1}', 'SMA LMS', 'web_platform', 'live', 'https://sma.example.test', 'Learning platform');
  `);
  if (withResource) {
    await db.exec(`
      INSERT INTO public.providers (id, name, slug, adapter_key)
      VALUES ('${IDS.provider}', 'Railway', 'railway', 'railway');
      INSERT INTO public.provider_accounts (id, provider_id, account_name)
      VALUES ('${IDS.account}', '${IDS.provider}', 'SCH Railway');
      INSERT INTO public.resources (id, system_id, provider_account_id, name, resource_type, client_id)
      VALUES ('${IDS.resource}', '${IDS.systemA}', '${IDS.account}', 'SMA API', 'web_app', '${IDS.c1}');
    `);
  }
}

test("system edit: admin can update metadata; id and unrelated columns preserved", async () => {
  const db = await createDb();
  await seedSystem(db, { withResource: true });
  await asService(db, () =>
    db.query(`SELECT public.set_system_status_token_hash('${IDS.systemA}', 'a3b0c0d0e0f01112131415161718191a1b1c1d1e1f202122232425262728292a')`)
  );

  await asUser(db, IDS.admin, () =>
    db.query(
      `UPDATE public.systems SET name = 'SMA LMS — STAGING', primary_url = 'https://staging.sma.example.test' WHERE id = '${IDS.systemA}'`
    )
  );

  const row = (
    await db.query(
      `SELECT id, client_id, name, status, status_token_hash FROM public.systems WHERE id = '${IDS.systemA}'`
    )
  ).rows[0];
  assert.equal(row.id, IDS.systemA, "system UUID preserved");
  assert.equal(row.name, "SMA LMS — STAGING");
  assert.equal(row.client_id, IDS.c1, "client unchanged");
  assert.equal(row.status, "live", "status unchanged by metadata edit");
  assert.ok(row.status_token_hash, "status token hash untouched");

  const linked = (
    await db.query(`SELECT system_id FROM public.resources WHERE id = '${IDS.resource}'`)
  ).rows[0];
  assert.equal(linked.system_id, IDS.systemA, "infrastructure link preserved");
});

test("system edit: client role cannot update systems (RLS)", async () => {
  const db = await createDb();
  await seedSystem(db);

  await asUser(db, IDS.c1, () =>
    db.query(`UPDATE public.systems SET name = 'Hijacked' WHERE id = '${IDS.systemA}'`)
  );

  const row = (await db.query(`SELECT name FROM public.systems WHERE id = '${IDS.systemA}'`)).rows[0];
  assert.equal(row.name, "SMA LMS", "client role update was silently denied by RLS");
});

test("system edit: invalid status and system_type rejected by CHECK constraints", async () => {
  const db = await createDb();
  await seedSystem(db);

  await rejects(
    asService(db, () =>
      db.query(`UPDATE public.systems SET status = 'bogus' WHERE id = '${IDS.systemA}'`)
    ),
    "invalid status"
  );
  await rejects(
    asService(db, () =>
      db.query(`UPDATE public.systems SET system_type = 'bogus' WHERE id = '${IDS.systemA}'`)
    ),
    "invalid system_type"
  );
});

test("system edit: cross-client transfer blocked when resources belong to another client", async () => {
  const db = await createDb();
  await seedSystem(db, { withResource: true });

  const err = await rejects(
    asService(db, () =>
      db.query(`UPDATE public.systems SET client_id = '${IDS.c2}' WHERE id = '${IDS.systemA}'`)
    ),
    "cross-client transfer"
  );
  assert.match(String(err.message), /Cannot transfer system|belong to another client/);
});

test("system edit: description rejects secret-looking content", async () => {
  const db = await createDb();
  await seedSystem(db);

  await rejects(
    asService(db, () =>
      db.query(`UPDATE public.systems SET description = 'Connect via postgres://user:p4ssw0rd@db.example.test/app' WHERE id = '${IDS.systemA}'`)
    ),
    "secret in description"
  );
});

// --- Source-level guards -------------------------------------------------

const ACTIONS_SRC = readFileSync("lib/actions/systems.ts", "utf8");
const EDIT_SRC = readFileSync("app/admin/systems/[id]/system-edit.tsx", "utf8");
const PAGE_SRC = readFileSync("app/admin/systems/[id]/page.tsx", "utf8");

test("updateSystem: admin authorization is checked before any update", () => {
  const fnStart = ACTIONS_SRC.indexOf("export async function updateSystem(");
  assert.ok(fnStart > -1, "updateSystem exists");
  const body = ACTIONS_SRC.slice(fnStart);
  assert.ok(body.indexOf("isAdmin") < body.indexOf('.update('), "admin check precedes update");
  assert.match(body, /Forbidden: Admin access required/);
});

test("updateSystem: whitelisted fields only — no token, suspension or infra columns", () => {
  const fnStart = ACTIONS_SRC.indexOf("export async function updateSystem(");
  const body = ACTIONS_SRC.slice(fnStart, ACTIONS_SRC.indexOf("export async function updateSystemOperationalNotes"));
  assert.ok(!/status_token_hash|suspension_|suspended_at|resumed_|operational_notes|origin_project_id/.test(body),
    "update payload must not include token, suspension, notes or origin fields");
  assert.ok(!/from\("resources"\)|from\('resources'\)/.test(body), "must not write resources");
  assert.match(body, /\.eq\("id", systemId\)/, "update targets the existing UUID");
  assert.ok(!/\.insert\(|\.delete\(/.test(body), "no insert/delete — preserves identity and history");
});

test("updateSystem: writes an audit event via the service-role client", () => {
  const fnStart = ACTIONS_SRC.indexOf("export async function updateSystem(");
  const body = ACTIONS_SRC.slice(fnStart, ACTIONS_SRC.indexOf("export async function updateSystemOperationalNotes"));
  assert.match(body, /createAdminClient\(\)/, "audit uses service-role client");
  assert.match(body, /writeAuditLog\(/);
  assert.match(body, /system\.updated/);
});

test("edit form: same fields as Create Digital System, no privileged fields", () => {
  for (const name of ["client_id", "name", "system_type", "status", "primary_url", "description"]) {
    assert.ok(EDIT_SRC.includes(`name="${name}"`), `form includes ${name}`);
  }
  assert.ok(!/status_token|suspension_|provider_account|external_reference|origin_project/.test(EDIT_SRC),
    "form must not expose token or infrastructure reassignment fields");
});

test("detail page: Edit System rendered for admins only", () => {
  assert.match(PAGE_SRC, /<SystemEdit /);
  assert.match(PAGE_SRC, /canEditSystem && <SystemEdit/, "gated on admin role");
});
