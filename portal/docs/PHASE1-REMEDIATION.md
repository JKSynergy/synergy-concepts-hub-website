# SCH Portal — Phase 1 Security & Data-Integrity Remediation Report

Scope: security, authorization, payment integrity, data integrity only. No redesign, no new modules, no new roles (admin / staff / client unchanged). Public website and SMA untouched.

**Verdict: PHASE 1 NOT COMPLETE.** Code and database work is done and tested locally (88/88 tests pass, `tsc` clean). Phase 1 cannot be closed until the live checks in §5/§15 are done, above all the `.env.local` exposure check and key rotation, which cannot be done from this environment. See the gate in §17.

---

## 1. Executive Summary

- **Privilege escalation closed at the database.** A client could `UPDATE profiles SET role='admin'` on their own row (proved by a failing-before test). Role, email, archive state and portal URL are now changeable only by an admin (or the server), and admins cannot change their own role. New sign-ups always become `client`; user-metadata can no longer choose a role.
- **Client data isolation.** Internal project notes and hidden deliverables are no longer readable by clients (RLS, not UI). Deliverable downloads derive the storage path from the database record; a browser-supplied path is never used.
- **Finance is admin-write at the database.** Staff can no longer create/edit/delete invoices, line items or payments. Financial records cannot be deleted by deleting a client (RESTRICT + archive flow).
- **Payments server-controlled.** Amount = invoice total minus settled payments, computed on the server. A pending payment row with our own unique reference is created before Paystack is called. The webhook verifies the HMAC-SHA512 signature, matches only by that reference, is idempotent, checks amount/currency, and flags anything unmatched instead of guessing an invoice.
- **One totals calculation** (database triggers) and **race-safe invoice/receipt numbering** (counter table).
- **Audit trail** is append-only, admin-readable, written by triggers (role changes, invoices, payments) and by the server (staff creation, client archive, Paystack anomalies).
- **Sign-in cleanup, security headers, deploy-script fix** for the `.env.local` staging problem.
- **Open:** the `.env.local` exposure is UNCONFIRMED and needs live verification plus key rotation; migration 010 must be applied; a Paystack test-mode end-to-end check is required.

## 2. Findings Verified

Status key: CONFIRMED / UNCONFIRMED–REQUIRES LIVE VERIFICATION / ALREADY FIXED / NOT APPLICABLE.
"Baseline test" = a test that runs against migrations 001–009 only and demonstrates the flaw before the fix.

| ID | Finding | Status | Evidence | Planned/Done Fix | Verification |
|---|---|---|---|---|---|
| R1 | Client can set own `profiles.role` (self-promote to admin) | CONFIRMED | `tests/baseline-before-010.test.mjs` "a client can make themselves admin" passes on 001–009 | `guard_profile_update` trigger + split policies (010) | `security-rls.test.mjs` (role/email/archive/url changes rejected; admin self-demotion rejected) |
| R2 | Sign-up metadata chose the role | CONFIRMED | baseline test "sign-up metadata chooses the role" | `handle_new_user` always `client`; metadata role removed from 4 API routes and `convertLead`; staff role set server-side with rollback | security-rls test; code review |
| R3 | Deliverable download trusted a browser-supplied storage path | CONFIRMED (code review) | old `getDeliverableDownloadUrl(path)` | now takes `deliverableId`, loads under RLS, `deliverableStoragePath()` | `access.test.mjs` (random path, `..`, other project, absolute, backslash) |
| R4 | Clients could alter milestones/bookings beyond intended transitions | CONFIRMED (policy review) | 001/004 policies allowed any update | milestone + booking guard triggers | security-rls tests |
| R5 | Clients could read internal notes and hidden deliverables | CONFIRMED | baseline test | RLS on `project_updates`, `deliverables`; client insert forced `is_internal=false` | baseline + security-rls tests |
| R6 | Invoice/receipt PDF routes used the service key without ownership check | CONFIRMED (code review) | old route code | session client only, `isUuid`, `canViewInvoiceDocument`; 404 for both "missing" and "not yours"; drafts hidden from clients | `access.test.mjs`; RLS tests |
| R7 | Staff could write invoices, items, payments | CONFIRMED | baseline test | admin-only write policies; no payment/receipt delete policy | finance-integrity tests |
| R8 | Paystack webhook signature | CONFIRMED (code review of prior route) | old route; **no automated baseline** (route needs live Paystack/Supabase) | `verifyPaystackSignature` HMAC-SHA512, raw body, `timingSafeEqual`, checked first | `payments.test.mjs` (valid/invalid/missing/wrong secret/tampered) |
| R9 | Webhook not idempotent; could attach payment to a guessed invoice | CONFIRMED (code review) | old route | match by unique reference only; compare-and-set settle; unmatched → audit flag; unique partial index on `paystack_reference` | `payments.test.mjs`, finance-integrity tests |
| R10 | Payment amount influenced by browser | CONFIRMED (code review) | old initiate route | client sends only `invoiceId`; amount computed server-side; overpay/zero/negative rejected; DB `payments_1_guard` re-checks | `payments.test.mjs`; DB tests |
| R11 | Invoice totals calculated in several places | CONFIRMED | audit; old `recalcInvoiceTotals` + client math | triggers are the single path; app code and PDF read stored values; CHECK constraints | finance-integrity tests |
| R12 | Invoice/receipt numbering race-prone | CONFIRMED | old MAX+1 style numbering | `document_counters` + `next_document_number`, backfilled | finance-integrity tests (incl. backfill) |
| R13 | Deleting a client cascaded to invoices/payments/receipts | CONFIRMED | old FK `ON DELETE CASCADE`; `delete-client-account.ts` | FKs RESTRICT; archive (ban + `archived_at`); permanent delete only with no history | finance-integrity + security-rls tests |
| R14 | No usable audit trail for critical actions | CONFIRMED | audit | append-only `audit_logs`, triggers, `writeAuditLog` | security-rls tests; `access.test.mjs` (no secrets) |
| R15 | `portal/.env.local` may be publicly exposed | **UNCONFIRMED – REQUIRES LIVE VERIFICATION** | See §5. Local evidence: an identical copy sat in the `_deploy` staging folder that is uploaded to Cloudflare Pages | deploy scripts fixed; procedure + key rotation in §5 | live check (§5) |
| R16 | Security headers absent on portal | CONFIRMED | `next.config.ts` was empty | headers added; CSP in Report-Only | see §6; header check on deployed URL (§15) |
| R17 | Sign-in: raw provider errors, attacker-controlled `?error=`, viewport zoom locked, no autocomplete | CONFIRMED | `app/login/page.tsx`, callback/confirm routes, `app/layout.tsx` | fixed strings, `error=auth_failed`, zoom enabled, `autoComplete` | code review; **no browser test run** |
| R18 | Middleware failed open on error / no archived check | CONFIRMED (code review) | old middleware | fail closed → `/login?error=unavailable`; archived → `account_disabled`; signed-in users leave `/login` | `is_staff` archived test; code review |
| R19 | Weak (`Math.random`) temporary passwords | CONFIRMED | grep | `crypto.randomInt` generator | `access.test.mjs` |
| R20 | No regression test suite | CONFIRMED | no tests dir | 88 tests, `npm test` | §11 |

## 3. Findings Fixed (code and database, verified locally)

R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R18, R19, R20 — each covered by the tests listed above, run against real Postgres (PGlite) with the project's own migrations 001–010, or against the pure-logic modules under Node. R16 and R17 are implemented but only code-reviewed / type-checked (see §4).

Per-fix documentation (root cause → change → files → migration → policy → test → result → manual check → uncertainty):

- **R1/R2 profiles.** Root cause: `profiles` UPDATE policy allowed the row owner to change every column; `handle_new_user` trusted `raw_user_meta_data.role`. Change: `profiles_update_own`/`profiles_update_admin` policies, `guard_profile_update` trigger (service context bypasses; non-admins cannot change role/email/`external_portal_url`/`archived_*`; admins cannot change their own role), `handle_new_user` inserts `client`. Files: migration 010; `app/api/admin/{staff,invite-staff,clients,invite}/…`, `lib/actions/bookings.ts`. Result: pass. Manual: sign in as a client, run `update profiles set role='admin' where id = auth.uid()` in the browser console with the anon client → must fail. Uncertainty: live Supabase sign-up/OAuth settings unverified.
- **R3/R5 files and notes.** Change: RLS on `project_updates`/`deliverables`, server-derived storage path, `safeFileName` on upload. Uncertainty: Storage bucket policies (`storage.objects`) were not in the migrations reviewed; confirm the bucket is private in the Supabase dashboard (§15).
- **R6 PDFs.** Change above. Manual: as client A request client B's invoice id → 404.
- **R7/R11/R12/R13 finance.** Admin-only writes; totals in triggers (`tax = round(subtotal*rate/100, 2)`, `amount = round(qty*unit_price, 2)`); totals frozen once a payment is settled; numbering via counters; RESTRICT FKs; `guard_invoice_delete` (only draft with no payments). Legacy rows are re-derived by the migration backfill. Uncertainty: any existing invoice whose stored total differs from the recomputed one will change when next touched (the backfill touches invoices without settled payments) — review totals after migration.
- **R8/R9/R10 Paystack.** Files: `lib/finance/payments.ts`, `lib/finance/paystack-store.ts`, `app/api/paystack/{webhook,initiate}/route.ts`, `app/client/invoices/[id]/page.tsx`. Uncertainty: the Supabase adapter (`paystack-store.ts`) is not covered by automated tests; UGX minor-unit handling (×100) is unverified with Paystack — see §15.

## 4. Findings Still Open

- **R15** exposure (live verification + rotation) — §5.
- **R16 CSP** is Report-Only; not yet enforced (needs a real-browser check on the deployed portal).
- **R17** not exercised in a browser here. The password-visibility toggle and the non-functional "Remember me" checkbox were deliberately not touched (visual scope).
- Staff retain finance **read** access (business decision needed).
- Staff can delete projects (cascades to milestones/updates/deliverables). Not requested; recommend restricting in Phase 2.
- New projects can still be created for an archived client.
- Payment reversal/refund design is deferred (settled payments are frozen by design).
- Progress recalculation is application code, not a DB trigger.
- Leftover scratch files were removed.
- `next build` did not finish inside this environment's time limit (slow mounted drive); `tsc --noEmit` passes. Run `npm run build` on your machine or let Vercel build before promoting.

## 5. Findings Requiring Live Verification — `.env.local` exposure (R15)

**I do not claim this happened.** What is known:

- `portal/.env.local` exists locally and contains `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and **`SUPABASE_SERVICE_ROLE_KEY`** (names only checked; values not printed).
- `_deploy/portal/.env.local` exists and is byte-identical. `_deploy/` is what `deploy.ps1` uploads to Cloudflare Pages (`wrangler pages deploy _deploy`). The old `prepare-deploy.mjs` / `prepare-upload.ps1` did not exclude `portal/`, so the staging folder held the whole portal, secrets included.
- Not known: whether that folder was ever uploaded in that state, or whether Cloudflare serves it. `git ls-files` shows `.env.local` is not tracked (ignored), so a Git-based deploy would not contain it; a local `wrangler` upload could.

**Fixes made:** both deploy scripts now exclude `portal`, `site-v2`, `.wrangler`, `.vercel` and any `.env*` file. **You must regenerate `_deploy`** (`node scripts/prepare-deploy.mjs`, which recreates it) and redeploy the marketing site so any previously uploaded copy is replaced. Do not run the old `_deploy`.

**Exact verification procedure** (run from any machine; it only reads):

1. `curl -sI https://<marketing-domain>/portal/.env.local` and `https://synergywebsite.pages.dev/portal/.env.local` (also each preview URL `https://<hash>.synergywebsite.pages.dev/portal/.env.local` from the Cloudflare Pages → Deployments list, since old deployments stay reachable).
2. Any response other than 404 (in particular 200 with `NEXT_PUBLIC_SUPABASE_URL` text) = **exposed**. Repeat for `/portal/`, `/portal/dev.log`, `/portal/supabase/migrations/001_*.sql` and `/.env.local`.
3. In Cloudflare Pages → each deployment, view the file list; look for `portal/`.
4. **Regardless of the result**, rotating is the safe course because exposure cannot be ruled out retroactively: Supabase → Project Settings → API → regenerate the **service_role** key (and JWT secret if you want to invalidate the anon key too); update Vercel env vars and redeploy; then rotate `PAYSTACK_SECRET_KEY` (Paystack dashboard → API keys) and `RESEND_API_KEY`. Confirm the old service key now returns 401 against `https://<project>.supabase.co/rest/v1/profiles?select=id&limit=1` (send it as `apikey` and `Authorization: Bearer` headers).
5. Delete old Cloudflare deployments that contain `portal/`.
6. Review Supabase logs (Auth and API) for service-role use from unfamiliar IPs since the first upload date.

Other live items: see §15.

## 6. Security Changes

- **Authorization at the boundary:** profile guard, staff/admin helpers (`is_staff()` excludes archived users; `is_admin()`), RLS on notes/deliverables/finance, admin-only academy writes.
- **Middleware:** fails closed; archived accounts blocked; `/admin/invoices|reports|academy` remain admin-only; signed-in users on `/login` are redirected.
- **Sign-in:** provider errors replaced by fixed strings; `?error=` accepts only known codes (`unavailable`, `account_disabled`, `auth_failed`); callback/confirm redirect with `error=auth_failed` and log only the status code; `autoComplete="email"` / `"current-password"`; pinch-zoom re-enabled (viewport `maximumScale`/`userScalable` removed).
- **Headers (`next.config.ts`):** `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, HSTS (2 years, includeSubDomains — **no `preload`**), `X-Powered-By` removed. CSP is **Report-Only** with `frame-ancestors 'none'`, `connect-src` limited to self + your Supabase origin. Not tested in a browser. To enforce, check the browser console on the deployed portal for violations, then rename the header key to `Content-Security-Policy`.
- **Temp passwords:** cryptographically random.
- **Deploy scripts:** never publish `portal/` or `.env*`.

## 7. Database / RLS Changes — migration `010_phase1_security_remediation.sql`

Summary: `profiles.archived_at/by`; `is_admin()`; audit table hardening + `write_audit_log()`; profile guard; notes/deliverable/milestone/booking policies and guards; admin-only finance writes; client SELECT excludes drafts and unsettled payments; RESTRICT foreign keys; invoice delete guard; `document_counters` numbering; totals triggers; CHECK constraints (added NOT VALID so old rows do not block the migration; run `VALIDATE CONSTRAINT` after reviewing data); unique partial index on `payments.paystack_reference`; payment/receipt/status triggers; audit triggers.

Safety: a new file, old migrations untouched. It requires 001–009 applied. It **aborts without changing anything** if duplicate `paystack_reference` values exist (test proves this). Run the pre-check first:

```sql
select paystack_reference, count(*) from public.payments
where paystack_reference is not null group by 1 having count(*) > 1;
```

## 8. Payment Changes

Flow: browser sends `{invoiceId}` → server loads invoice via RLS, rejects non-owner (404), draft/cancelled/paid/other statuses (409), computes balance from settled payments → inserts pending payment `SCH-<uuid>` (admin client) → calls Paystack with minor-unit amount (+ optional `PAYSTACK_CURRENCY`) → webhook verifies signature → finds payment by reference → checks status/amount/currency → sets `paid_at` with compare-and-set → DB trigger re-checks balance/invoice state, creates the receipt, sets paid/partially paid. Duplicate deliveries return 200 without a second settlement. Unmatched/mismatched events return 200 (so Paystack stops retrying) and are recorded as `paystack.flagged.<reason>` in the audit log for admin review. Transient errors return 500 so Paystack retries.

## 9. Audit Logging Changes

Table: `audit_logs` (actor nullable, `actor_role`, `details`), append-only trigger, admin-only read, no direct writes for app roles. Recorded: role changes, archive/restore, invoice created/status changed/deleted, payment initiated/recorded/settled, staff created/invited, client archived/deleted, Paystack anomalies. Secrets are redacted by key name before storage.

## 10. Tests Added

| File | Tests | Covers |
|---|---|---|
| `tests/baseline-before-010.test.mjs` | 4 | R1, R2, R5, R7 exist on migrations 001–009 |
| `tests/security-rls.test.mjs` | 29 | escalation, isolation, notes/deliverables, milestones, bookings, audit, archived users |
| `tests/finance-integrity.test.mjs` | 29 | admin-only finance, totals, numbering, RESTRICT, delete guard, payment guard/idempotency, migration abort + backfill |
| `tests/payments.test.mjs` | 20 | intent rules, signature, webhook idempotency/unmatched/mismatch |
| `tests/access.test.mjs` | 6 | PDF ownership, deliverable path, file names, uuid/role, audit redaction, temp password |
| helpers | — | `tests/helpers/db.mjs` (PGlite harness) |

Run: `npm install && npm test` (Node ≥ 22.18, or Node 22 with the flag already in the script).

## 11. Test Results

`npm test`: **88 tests, 88 pass, 0 fail** (about 58 s). `npx tsc --noEmit`: no errors. `next build`: not completed here (environment time limit) — **unverified**.

Limits of these tests: PGlite is real Postgres, but Supabase specifics (GoTrue, Storage policies, PostgREST, real JWTs) are stand-ins. The Supabase store adapter, the Next routes, the middleware, the login page and the headers are not covered by automated tests.

## 12. Files Changed (all under `portal/` unless noted)

New: `supabase/migrations/010_…sql`, `lib/finance/{payments,paystack-store}.ts`, `lib/security/{access,temp-password}.ts`, `lib/audit.ts`, `lib/admin/client-lifecycle.ts`, `tests/*`, `docs/PHASE1-REMEDIATION.md`.
Modified: `app/api/paystack/{webhook,initiate}/route.ts`, `app/api/invoices/[id]/{route,pdf/route}.ts`, `app/api/receipts/[id]/pdf/route.ts`, `app/api/admin/{clients,clients/[id],staff,invite,invite-staff}/route.ts`, `app/admin/clients/{page,client-actions}.tsx`, `app/admin/invoices/new/page.tsx`, `app/client/invoices/[id]/page.tsx`, `app/login/page.tsx`, `app/auth/{callback,confirm}/route.ts`, `app/layout.tsx`, `components/deliverables-section.tsx`, `lib/actions/{invoices,payments,projects,bookings}.ts`, `lib/pdf/invoice-template.tsx`, `lib/supabase/middleware.ts`, `middleware.ts`, `next.config.ts`, `package.json`, `package-lock.json`, `.env.example`.
Outside `portal/`: `scripts/prepare-deploy.mjs`, `prepare-upload.ps1`.
Removed: `tests/helpers/smoke.mjs`, `lib/admin/delete-client-account.ts` (old unsafe delete).
Note: `git status` also lists many marketing-site files as modified that this work did not touch (likely line-ending changes); review before committing.

## 13. Database Migrations Added

`010_phase1_security_remediation.sql` only.

## 14. Deployment Requirements (in order)

1. Rotate keys first if §5 shows exposure (or regardless, recommended).
2. Take a Supabase backup / snapshot.
3. Run the duplicate-reference pre-check (§7). Resolve any rows.
4. Confirm migrations 001–009 are applied, then apply 010 in the SQL editor.
5. Review invoices whose totals changed (`select id, invoice_number, total from invoices order by updated_at desc limit 50`), then optionally `alter table … validate constraint` on the NOT VALID checks.
6. Set env vars on Vercel: existing ones plus optional `PAYSTACK_CURRENCY` (e.g. `UGX`, only after confirming with Paystack what your account charges in).
7. Deploy the portal. Deploy the marketing site with the corrected scripts (regenerate `_deploy`).
8. Delete old Cloudflare deployments containing `portal/`.

## 15. Manual Production Checks

1. §5 checks (`/portal/.env.local` = 404 everywhere).
2. Sign in as a client: `update profiles set role='admin'` from the browser console fails; `/admin` redirects away.
3. Client A cannot open client B's invoice/receipt PDF (404); a draft invoice PDF is 404 for its client.
4. Client cannot see internal notes or hidden deliverables; a forged deliverable id/path fails.
5. Staff user cannot create/edit an invoice or payment.
6. Paystack **test mode**: pay an invoice; expect one receipt, status paid, one audit entry. Re-send the webhook from the Paystack dashboard: no second payment. Send a webhook with an unknown reference: 200 and a `paystack.flagged.unmatched_reference` audit row. Send with a bad signature: 401. Confirm the amount is right for UGX (minor units).
7. Archive a test client: cannot sign in, invoices remain.
8. Supabase dashboard: storage bucket `deliverables` is private; email sign-up / Google OAuth settings match your intent (new sign-ups become clients).
9. `curl -I` the portal: security headers present; browser console shows no CSP violations before enforcing.
10. Login: `/login?error=<script>` shows no attacker text; wrong password shows the generic message; pinch-zoom works on mobile; password manager fills the form.

## 16. Remaining Risks

Possible historic key exposure (unresolved). Staff finance read and project delete. CSP not enforced. Supabase adapter and routes lack automated tests. UGX minor-unit assumption. Project progress not trigger-enforced. Live Supabase auth/storage configuration unverified. Marketing-site `_headers` and Cloudflare configuration were not audited beyond the exposure.

## 17. Phase 2 Readiness Gate

- [x] No client can elevate role (tested)
- [x] Role changes server-controlled (tested)
- [x] RLS enforces client isolation, notes, deliverables (tested)
- [x] Arbitrary storage paths rejected (tested)
- [x] Invoice/receipt PDFs enforce ownership (tested logic + RLS; route not run live)
- [x] Staff cannot mutate finance (tested)
- [x] Paystack signature verified; webhook idempotent; amounts server-controlled; no guessed invoices (tested logic; adapter needs live test)
- [x] Totals single-path; numbering safe; client deletion cannot destroy finance records (tested)
- [x] Critical actions audit-logged (tested)
- [x] Regression suite exists and passes (88/88)
- [ ] **`.env.local` exposure verified and keys rotated — UNRESOLVED (critical)**
- [ ] Migration 010 applied to production — PENDING
- [ ] Paystack test-mode end-to-end check — PENDING
- [ ] `next build` on Vercel passes — PENDING
- [ ] Headers/CSP confirmed live; CSP enforced or accepted as Report-Only — PENDING

**PHASE 1 NOT COMPLETE.** Move to Phase 2 when the four unchecked critical items (exposure/rotation, migration applied, Paystack test, build) are done.
