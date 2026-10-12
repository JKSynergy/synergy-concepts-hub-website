// Real-Postgres (PGlite) harness for the security / data-integrity tests.
// It applies the project's own migrations in order, on top of minimal stand-ins
// for the Supabase pieces (auth schema, storage schema, roles).
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(here, "..", "..", "supabase", "migrations");

const SUPABASE_STANDINS = `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE SCHEMA storage;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}',
  raw_app_meta_data jsonb NOT NULL DEFAULT '{}'
);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE storage.buckets (
  id text PRIMARY KEY,
  name text,
  public boolean,
  file_size_limit bigint,
  allowed_mime_types text[]
);
CREATE TABLE storage.objects (id uuid DEFAULT gen_random_uuid(), bucket_id text, name text, owner uuid);
CREATE FUNCTION public.uuid_generate_v4() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
`;

export async function createDb({ upTo } = {}) {
  const db = new PGlite();
  await db.exec(SUPABASE_STANDINS);
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    if (upTo && f > upTo) break;
    const sql = readFileSync(join(MIGRATIONS, f), "utf8").replace(/CREATE EXTENSION[^;]*;/gi, "");
    try {
      await db.exec(sql);
    } catch (e) {
      e.message = `migration ${f} failed: ${e.message}`;
      throw e;
    }
  }
  // PGlite does not consistently apply ALTER DEFAULT PRIVILEGES to every later
  // migration-created table, so bootstrap the Supabase table grants explicitly.
  await db.exec("GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;");
  // Preserve deliberate least-privilege revocations from the latest migration.
  if (!upTo || upTo >= "036_deliverable_publication.sql") {
    await db.exec("REVOKE UPDATE ON public.deliverables FROM PUBLIC, anon, authenticated;");
  }
  return db;
}

const q = (v) => (v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
export { q };

/** Run fn as an authenticated end user (RLS + triggers apply, like the anon-key client). */
export async function asUser(db, userId, fn) {
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${userId}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false);`);
  }
}

/** Run fn as the service role (bypasses RLS; auth.uid() is null), like the server admin client. */
export async function asService(db, fn) {
  await db.exec(`SET ROLE service_role; SELECT set_config('request.jwt.claim.sub', '', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`RESET ROLE;`);
  }
}

/** Expect a statement to be rejected; returns the error. */
export async function rejects(promise, label = "statement") {
  try {
    await promise;
  } catch (e) {
    return e;
  }
  throw new Error(`${label} was expected to fail but succeeded`);
}

export async function seed(db) {
  const ids = {
    admin: "00000000-0000-0000-0000-0000000000a1",
    staff: "00000000-0000-0000-0000-0000000000b1",
    c1: "00000000-0000-0000-0000-0000000000c1",
    c2: "00000000-0000-0000-0000-0000000000c2",
  };
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${ids.admin}', 'admin@example.test'),
      ('${ids.staff}', 'staff@example.test'),
      ('${ids.c1}', 'client1@example.test'),
      ('${ids.c2}', 'client2@example.test');
    -- server-side role assignment (service context: auth.uid() is null)
    UPDATE public.profiles SET role = 'admin' WHERE id = '${ids.admin}';
    UPDATE public.profiles SET role = 'staff' WHERE id = '${ids.staff}';
  `);
  return ids;
}
