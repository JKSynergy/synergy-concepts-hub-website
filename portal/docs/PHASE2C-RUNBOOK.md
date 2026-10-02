# Phase 2C runbook — verifying the portal against the DEV Supabase project

Everything runs from `portal/` on your Windows PC. No SQL Editor, no copying files, no manual test users.
Migrations 001–012 are already installed on DEV (`outuocpsotiozkpyksex`, "SCH Portal DEV"); nothing in this runbook applies a migration or changes the schema.

## What the command does

`npm run phase2c:verify` runs these stages in order and writes one report:

| Stage | What | Needs write gate? |
|---|---|---|
| A–B | Confirms the DEV project identity and that the required variables exist (values never printed) | no |
| C | Schema state: 16 tables, migration 008/010/011/012 markers, 012 helper functions | no |
| D | Table privileges: service_role reads every table; anon reads none | no |
| E | Optional, read-only, needs `PHASE2C_DB_URL`: runs `docs/phase2c-baseline.sql` (SELECTs only), RLS flags and migration markers, the privilege matrix, helper-function EXECUTE | no |
| F–G | Creates/reuses `phase2c.{admin,finance,staff,clienta,clientb}@example.test`, random passwords into `.phase2c-accounts.local.json` (git-ignored), never printed | **yes** |
| H | Real Supabase Auth sign-in for each role; own-profile role; self-promotion attempts; sign-up metadata cannot pick a role | yes |
| S | Test data through the roles that own each action (Admin: projects/services; Finance: invoices/payments) | yes |
| I | Client A vs client B isolation; clients cannot write finance/other-client data; anon reads nothing | yes |
| J | Finance: Clients, Projects, Invoices, Payments, Receipts, Reports totals; edit draft, issue; blocked from staff/admin/service/role/delete actions | yes |
| K | Staff: no invoices/line items/payments/receipts/aggregates; Services read-only; operational access intact | yes |
| L | Invoice lifecycle: SENT/OVERDUE/CANCELLED → DRAFT refused; PAID/PARTIALLY PAID → CANCELLED refused (Finance, Admin and service role); valid transitions; receipts | yes |
| M | Storage: `deliverables` and `finance-docs` are private; no role can read directly; signed URLs work; tampered URL refused | yes |
| N | Report: `phase2c-reports/latest.json` and `latest.md` (plus timestamped copies) | — |

## One-time setup (PowerShell, in `portal\`)

Either set the variables in the session:

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL      = "https://outuocpsotiozkpyksex.supabase.co"
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = "<DEV anon key>"
$env:SUPABASE_SERVICE_ROLE_KEY     = "<DEV service_role key>"
$env:PHASE2C_DEV_PROJECT_REF       = "outuocpsotiozkpyksex"
```

or copy `phase2c.dev.env.example` to `.phase2c.dev.env` (git-ignored), fill it in, and use `npm run phase2c:verify:file` (Node 20.6+). The scripts **never** read `.env` or `.env.local`.

## Run it

1. Read-only first (writes nothing, exit code 3 = INCOMPLETE is expected):
   ```powershell
   npm run phase2c:verify
   ```
2. Full run — retype the project ref to confirm writes to DEV:
   ```powershell
   $env:PHASE2C_CONFIRM_DEV_WRITES = "outuocpsotiozkpyksex"
   npm run phase2c:verify
   ```
3. Optional direct database checks (stage E). Copy the connection string from Project Settings → Database (this is the only dashboard read, and it is optional):
   ```powershell
   npm install --no-save pg
   $env:PHASE2C_DB_URL = "<DEV connection string>"
   npm run phase2c:verify
   ```
   The URL must point at the DEV project; the guard refuses any other. The connection is opened `READ ONLY`.

Exit codes: `0` PASS or PASS_WITH_GAPS, `1` FAIL, `2` refused by the guard (nothing was contacted), `3` INCOMPLETE (mandatory stages did not run).

Send me `phase2c-reports/latest.md` (it contains no keys, tokens or passwords).

Other scripts: `npm run phase2c:preflight` (16 tables, prints the PostgREST error code on failure), `npm run phase2c:seed` (accounts only, also needs the write gate), `npm run phase2c:guard`.

## What it will never do

- Contact any project other than one on the allowlist in `scripts/phase2c-guard.mjs` (currently only `outuocpsotiozkpyksex`). A production URL or key is refused before any network call: the URL, `PHASE2C_DEV_PROJECT_REF` and the legacy key claims (`ref`, `role`) must all agree; `PHASE2C_PRODUCTION_PROJECT_REF`, if you set it, is refused explicitly.
- Write without `PHASE2C_CONFIRM_DEV_WRITES=<ref>`, or to a database that looks like production (more than 3 real-looking profiles, more than 100 non-test invoices, or a settled Paystack payment with a real reference).
- Run any schema change, migration, GRANT/REVOKE, policy change, or delete application data. The only deletes are the temporary sign-up probe user and blocked-attempt probes that are expected to fail.
- Print keys, tokens, passwords, signed URLs or the database URL; all output and reports are redacted, and a report containing a secret is refused.
- Call Paystack. One "Paystack-style" payment row (`phase2c-` reference) is inserted by the service role to prove server-side settlement.

Test rows are tagged `PHASE2C <run id>` and stay in DEV; re-running reuses the accounts (passwords kept) and adds a fresh tagged set. Delete the `phase2c.*@example.test` users in Authentication → Users when you are finished.

## When something fails

| Symptom | Meaning |
|---|---|
| `Refusing: …` (exit 2) | The guard stopped before contacting anything; the message says which condition failed. |
| D1 FAIL "service_role blocked on … 42501" | Missing table privileges (see `PHASE2C-PRIVILEGE-BOOTSTRAP-RECOMMENDATION.md`). Not an RLS result. |
| F0 FAIL | DEV holds data that does not look like test data; nothing was written. |
| INCOMPLETE | The write gate was not confirmed, or an earlier stage stopped the run; the report says which. |
| A single I/J/K/L FAIL | A real authorization or lifecycle difference between the hosted project and what the local tests assume; send the report. |

## Not covered by this command

Browser sessions, middleware redirects and role navigation, server actions and API routes exercised through the running app, PDF/download routes, password reset e-mails, responsive/visual passes, and Paystack. These are listed at the end of every report and in `PHASE2C-REAL-SUPABASE-VERIFICATION.md` §18.

## Applying future migrations to DEV without the SQL Editor (not built)

Deliberately out of scope for the verification command. A separate, explicitly DEV-only `phase2c:migrate:dev` (direct database URL, the same guard and write gate, ordered files, one transaction per file, `ALTER TYPE … ADD VALUE` files run alone) is possible if you want it; the Supabase CLI would first need a `config.toml` and a fix for the two `003_*` files sharing a version prefix, which is why it is not used today.
