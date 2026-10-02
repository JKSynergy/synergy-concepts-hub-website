# Table privileges on a fresh Supabase project — recommendation (nothing created, nothing applied)

Status: **recommendation only.** No migration was created for this, none was applied by any script, and production was not touched.

## What happened

On the fresh DEV project (`outuocpsotiozkpyksex`) migrations 001–012 installed cleanly, but PostgREST answered every application table with HTTP 403 (PostgreSQL `42501`) for the service role and HTTP 401 for the anon key. `information_schema.role_table_grants` for `public.profiles` showed only `REFERENCES`, `TRIGGER` and `TRUNCATE` for `anon`, `authenticated` and `service_role` — no `SELECT`, `INSERT`, `UPDATE` or `DELETE`.

## Why (from the migrations and the test harness)

- Migrations 001–012 create tables, enable RLS and write policies, but **never grant table privileges**. The only GRANT/REVOKE statements in them concern functions (007, 010, 012) and three revokes in 010 (`audit_logs` writes and `document_counters` from `anon, authenticated`).
- Nothing in them revokes anything from `service_role`. So the missing privileges were not removed by a migration; they were never granted.
- The application therefore relied on Supabase's automatic default grants for new tables in `public`. This project does not have them (which project setting causes that was not inspected; `select * from pg_default_acl;` on DEV would show it).
- The local PGlite test harness (`tests/helpers/db.mjs`) hid the dependency: it runs `ALTER DEFAULT PRIVILEGES … GRANT ALL` and a blanket `GRANT ALL ON ALL TABLES` for all three roles ("Supabase behaviour"). All 139 local tests therefore ran on a database where every role already held every privilege, narrowed only by RLS and 010's revokes.

## The manual correction applied to DEV

Explicit table list, `SELECT, INSERT, UPDATE, DELETE` only, no `ALL`, RLS untouched:

- `service_role`: the 16 application tables.
- `authenticated`: the 14 tables users legitimately reach; `audit_logs` `SELECT` only; nothing on `document_counters`.
- `anon`: nothing.

The exact statements are kept for reference in `docs/proposed-013-table-privileges.sql`. That file is **not** in `supabase/migrations/` and no script runs it. The local verification suite applies it to its Postgres stand-in, which proves the model is sufficient for every Admin/Finance/Staff/Client check.

## Should this become a migration or bootstrap step? Yes — recommendation

| Option | Assessment |
|---|---|
| **A. New migration `013_table_privileges.sql`** with the statements above (recommended) | Idempotent (`GRANT` is a no-op when already held), so it is harmless on production, where the privileges presumably already exist from the older defaults. A fresh project then works from migrations alone. Migrations 001–012 stay untouched. |
| B. One-off "bootstrap" SQL documented in the README | Works, but is easy to forget and cannot be verified by the test suite. |
| C. `ALTER DEFAULT PRIVILEGES` in the migration | Broader than needed (it would grant on every future table automatically) and is what caused the hidden dependency in the first place. Not recommended. |
| D. Change nothing | A rebuilt or new project (DEV, staging, disaster recovery) fails in the same way. Not recommended. |

If you approve option A:

1. Create `013_table_privileges.sql` from the proposed SQL. It is applied to DEV only first (DEV already holds the same grants, so it is a no-op there), then to production only with your explicit go-ahead after DEV verification.
2. Change the test harness so it stops granting `ALL` by default and lets the migrations provide the privileges. Then any future migration that creates a table without granting it fails the local suite instead of failing on a fresh project.
3. Add the rule to the migration checklist: every new application table needs an explicit grant to `service_role` and `authenticated` (and none to `anon` unless a policy targets it).

## Related observations (not changed)

- **`TRUNCATE`, `REFERENCES`, `TRIGGER`** remain granted to `anon` and `authenticated` on DEV. `TRUNCATE` ignores RLS, but it is not reachable through the Data API. Revoking them is a separate hardening step; `npm run phase2c:verify` reports it as a WARN when a direct database URL is supplied.
- **Function `EXECUTE`**: RLS policies call `is_staff()`, `is_admin()`, `is_finance()`, `can_access_finance()` and `owns_project()` as the calling role. The migrations do not grant `EXECUTE` on them; they rely on the default `PUBLIC` execute. Stage E4 of `phase2c:verify` checks this directly; stage H (real sessions) proves it behaviourally.
- **Public catalogue by policy**: the `SELECT` policies on `service_catalog` and `academy_courses` are open to everyone for active rows. With `anon` holding no table privilege this is currently unreachable; if `anon` ever gets `SELECT`, the active catalogue becomes public. The app does not read either table without a signed-in session.
