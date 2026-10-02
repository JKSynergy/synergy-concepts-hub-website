# Phase 2C — Real Supabase verification

**Overall status: PARTIAL. The real-Supabase part was NOT performed. UPDATE: the authorization findings below were resolved by migrations 011/012 (see `AUTHZ-FINANCE-ROLE-DESIGN.md`); the real-project run should now target the final model.** This session (a cloud container) cannot reach any Supabase project. I have no development/staging URL or keys, and I was told not to read the portal's `.env.local`, so I could not confirm which project it points at (it may be production). Per the brief ("if the environment is not safe for testing, STOP"), I did not attempt it.

What was done instead is labelled **REAL POSTGRES (PGlite)**: actual PostgreSQL executing migrations 001–010, with RLS and triggers enforced, but with stand-ins for Supabase Auth, storage, PostgREST and the hosted project. It answers schema, RLS and trigger questions; it says nothing about the real Supabase Auth, sessions, JWTs, email, storage or hosting.

## 1. Environment used
- Real Supabase: none. Production: not touched. Nothing deployed, no migration run against any hosted project.
- Real Postgres engine: PGlite, migrations 001–010 in order (`tests/helpers/db.mjs`).

## 2. Migration state
- Hosted dev project: NOT TESTED (`docs/phase2c-baseline.sql` is a read-only script for you to run there).
- PGlite: 001–010 apply cleanly. Schema baseline test (all 15 expected tables exist with RLS on): PASS (PGlite only).

## 3. Authentication — NOT TESTED against real Supabase
Login, wrong password, logout, session persistence, password reset and set-password were exercised only against the mock. Mock results are not evidence about Supabase.

## 4. RLS results (REAL POSTGRES, not hosted Supabase)
| Test | Result |
|---|---|
| Client cannot become admin/staff; sign-up metadata cannot choose a role; staff cannot change roles | PASS (existing suite) |
| Client isolation: own profile/projects/milestones/bookings only; no other client's projects, deliverables, invoices, line items, payments, receipts | PASS (existing suite) |
| Client cannot read internal updates or hidden deliverables | PASS |
| Client sees no draft invoices or pending payment attempts | PASS |
| Staff cannot write invoices, line items, payments, or delete clients | PASS |
| Staff cannot write academy courses | PASS |
| Audit log readable only by admin, immutable | PASS |
| Leads: clients see none; no anon-key inserts | PASS |
| **Staff can READ invoices, line items, payments, receipts** | **FINDING** (see below) |
| **Staff can INSERT/UPDATE/DELETE `service_catalog`** | **FINDING** |
| Staff can update/delete leads | Behaviour by policy (`is_staff()`); consistent with staff having Enquiries |
| API/PostgREST-level and storage-bucket policies | NOT TESTED |
| Client access to another client's storage files | NOT TESTED (path check is unit-tested only) |
| UI/middleware redirects (mock) | PASS on mock only; not evidence of authorization |

**Authorization findings needing your decision (not changed):**
1. **Finance is hidden from staff only by middleware and page checks. At the database, migration 010 lets any staff user read every invoice, payment and receipt** (`*_select_visible` = `is_staff()`). A staff member with the anon key could query them directly. If "staff cannot access Finance" means data, not just screens, this needs a policy change (a new migration, which I did not create).
2. **Staff can edit the service catalogue at the database**, and Services is in staff navigation. Confirm whether that is intended.

## 5. Invoice results (REAL POSTGRES)
- The app's exact insert (no number, no totals) gives `SCH-YYYY-NNNN`, totals `0.00`: PASS.
- Line items, subtotal, tax and total (e.g. 2×50,000 + 1×25,000 at 18% → 125,000 / 22,500 / 147,500): PASS.
- **"UGX NaN" root cause: mock-only.** The mock inserts no invoice number and doesn't run the totals trigger, so `total` was undefined. On real Postgres totals are always finite numeric strings. Not reproducible in the schema. Whether the deployed dev project behaves the same: NOT TESTED.
- Detail reload versus list view on real Supabase: NOT TESTED.

## 6. Invoice status workflow (current DB behaviour; the business workflow remains your decision)
- Allowed: draft→sent/cancelled/overdue; sent→overdue/cancelled/draft; overdue→sent/cancelled; cancelled→sent/draft.
- Rejected: any unpaid→paid or partially paid; anything with recorded payments → draft, sent or overdue.
- Statuses follow payments automatically (partial payment → "partially paid", full → "paid").
- **Finding:** a paid or partially paid invoice can be set to `cancelled` with its payments remaining. Also an issued (sent) invoice can go back to draft. Confirm both are intended.

## 7. Payments (REAL POSTGRES)
Payment→invoice association, balance, status interaction, duplicate/over-payment refusal, receipts and Paystack-style settlement: PASS (existing 88-test suite). No Paystack transaction was made. Finance UI against real data: NOT TESTED.

## 8–11. Enquiries/bookings, projects, client portal, team/services on real Supabase — NOT TESTED
Only RLS-level checks above. The relationship-shape handling (array vs object embeds) has not been seen against real PostgREST responses; it remains the highest UI-risk item.

## 12. Audit logs (REAL POSTGRES)
Invoice creation, status changes, payments, role changes, profile archiving and webhook settlement produce audit rows: PASS (existing suite). Server-action-level audit entries on the hosted project: NOT TESTED.

## 13. Security regression
- Full suite on the device clean copy: see final status; 94 tests pass before this phase, plus the 9 new ones.
- Security-sensitive files (`lib/actions`, `lib/supabase`, `lib/finance`, `lib/security`, `lib/types.ts`, `middleware.ts`, `app/api/paystack`) are byte-identical to the pre-2B copy (SHA-256). Result: PASS.

## 14. Browser results
Mock only (Phase 2B). Real-Supabase browser testing: NOT TESTED.

## 15. Defects discovered / fixed
- Discovered: the two authorization findings and the cancel-after-payment behaviour above (all decisions, not fixed).
- The UI lets staff see Convert/Archive on leads; the database allows it, so no defect.
- Fixed: none. No application code changed in this phase; only tests and docs were added.

## 16. Remaining limitations and open decisions
- Everything marked NOT TESTED needs a real dev Supabase project. To do this I need either (a) you to run `docs/phase2c-baseline.sql` there and the app locally on your machine with dev credentials, or (b) a staging URL, anon key and test accounts provided in a way that doesn't expose them here.
- Product decisions: Academy retirement, enquiry table merge, project type, client portal scope, Team account actions, invoice status workflow, plus the two authorization questions above.

## 17. Update after migrations 011/012 (real PostgreSQL / PGlite, 139 tests passing)
| Test | Result |
|---|---|
| Staff cannot read invoices, line items, payments, receipts, or report aggregates | PASS (real Postgres) |
| Finance can read/create/edit invoices, record payments, read receipts and reports data | PASS |
| Finance can read client profiles, projects, milestones; not staff/admin profiles, internal updates, leads, bookings, audit log | PASS |
| Finance cannot assign roles, become admin, delete invoices, or write Services/projects | PASS |
| Only admin assigns/removes finance; sign-up metadata cannot choose finance; archived finance loses access | PASS |
| Staff can read Services; cannot create, edit, delete | PASS |
| Client isolation unchanged (own non-draft only, nothing of others) | PASS |
| SENT→DRAFT, PAID→CANCELLED, PARTIALLY PAID→CANCELLED rejected (finance, admin, service role); valid transitions and Paystack-style settlement still work | PASS |
| App lifecycle function equals database trigger for all 30 transitions | PASS |
| Route policy per role; team forms restricted to staff/finance; no role literals outside the helper | PASS (source/unit tests) |
| Browser, mock backend (no RLS): finance/admin/staff navigation, read-only clients/projects/services, no delete for finance | PASS on mock only |
| Everything on a hosted Supabase project (auth, storage, PostgREST, real browser sessions) | NOT TESTED |
The two earlier authorization FINDINGS (staff read of finance data; staff write of services) and the cancel-after-payment behaviour are now closed at the database.

## 18. Automated DEV verification workflow (`npm run phase2c:verify`) — built and tested locally, NOT YET RUN against DEV
State confirmed by you before this section: DEV project `outuocpsotiozkpyksex`, migrations 001–012 installed, a table-privilege gap diagnosed and corrected on DEV, preflight returning 200 for the expected tables, production untouched.

**Tooling added (no application code, no migration, no schema change):** `scripts/phase2c-verify.mjs` (orchestrator), `phase2c-checks.mjs` (stages C–M), `phase2c-lib.mjs` (HTTP client, recorder, report), `phase2c-guard.mjs` (extended), `phase2c-seed-test-accounts.mjs` (now idempotent, importable), `phase2c-preflight.mjs` (16 tables, shows PostgREST error code), `docs/proposed-013-table-privileges.sql` (reference only), `phase2c.dev.env.example`, npm scripts `phase2c:*`.

**Fixed in the existing tooling:** the old seed script rewrote `.phase2c-accounts.local.json` from scratch on every run (an existing account then lost its saved password) and the file was not actually in `.gitignore`; it is now merged safely, written with restricted permissions and git-ignored together with `.phase2c.dev.env` and `phase2c-reports/`.

| What | Result |
|---|---|
| Guard: allowlist, ref/URL/host agreement, legacy key `ref`/`role` claims, production ref, DB URL ref, write confirmation, redaction | PASS (unit tests) |
| Scripts never read `.env*`, never print secrets, contain no DDL/GRANT/REVOKE, `pg` stays optional | PASS (static tests) |
| Migrations 001–012 byte-identical to the installed set | PASS (fingerprint test) |
| Whole workflow (stages A–M) against a stand-in for Supabase's HTTP APIs backed by REAL Postgres with migrations 001–012 and DEV-style privileges | PASS, 48 checks, 0 fail |
| Same run detects: staff reading invoices, a client reading all invoices, missing lifecycle trigger, staff writing Services, missing table privileges (the DEV gap), production-looking data | PASS (mutation tests; the workflow fails when it should) |
| Read-only run writes nothing (no auth users, no rows) and reports INCOMPLETE | PASS |
| Second run is idempotent (accounts kept, same passwords) | PASS |
| **Any of the above against the hosted DEV project** (real Auth tokens, hosted PostgREST status codes, hosted Storage API, direct DB checks) | **NOT TESTED until you run the command** |

Limits of the local proof: the stand-in emulates only the API subset the workflow uses; hosted status codes, Storage endpoint details and Auth behaviour can differ, and the first hosted run may need small adjustments. Checks accept any 4xx as "rejected" and then re-read state, to stay robust to that.

**Recommendation (not implemented):** record the table grants as migration 013 — see `PHASE2C-PRIVILEGE-BOOTSTRAP-RECOMMENDATION.md`.

**Remaining for the real browser verification:** browser sign-in/out/reset flows on hosted Auth; middleware redirects and role landing pages; role-based navigation; server actions and API routes through the running app (incl. application-level lifecycle messages); invoice/receipt/deliverable download routes; responsive/visual passes at four viewports for Admin, Finance, Staff and Client; Paystack (not tested, none planned).
