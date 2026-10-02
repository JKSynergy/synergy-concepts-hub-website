# Phase 2C — real browser verification of the portal against DEV

Goal: use and inspect the real portal (Next.js, local) on the real DEV Supabase project (`outuocpsotiozkpyksex`), with the five existing test accounts. **Record defects; fix nothing without approval.** No database, migration, RLS or grant change is part of this stage.

## 1. Start the portal against DEV (and only DEV)

In PowerShell, in `portal\`, with the same DEV variables you used for `phase2c:verify` (URL, anon key, service-role key, `PHASE2C_DEV_PROJECT_REF`) plus the write confirmation (the running portal can write to DEV):

```powershell
$env:PHASE2C_CONFIRM_DEV_WRITES = "outuocpsotiozkpyksex"
npm run phase2c:dev
```

Use this instead of `npm run dev`. Plain `next dev` auto-loads `.env.local`, which may contain production values (Supabase, a live Paystack key, Resend, notification address). The launcher:

- runs the same guard as every Phase 2C script (allowlisted DEV ref; URL, ref and key claims agree; production ref refused) and never reads `.env` or `.env.local`;
- sets every environment variable the app reads in the child process (process values beat `.env.local`, so nothing in that file can redirect the session);
- **switches off** Paystack, e-mail (Resend) and enquiry notifications for the session, so no real payment, e-mail or notification can fire;
- refuses to start if anything already answers on port 3000 (an old server may carry other settings);
- after start-up reads the security header the *running server* derived from its own Supabase URL and stops the server if it names any project other than the DEV ref. The banner then says `Supabase: outuocpsotiozkpyksex (DEV — verified from the running server)`.

If you do not see that banner, do not use the portal. Stop with Ctrl+C. Every browser session below assumes that banner was shown.

## 2. Signing in without exposing passwords

```powershell
npm run phase2c:cred            # lists the five accounts (no passwords)
npm run phase2c:cred -- finance # copies that password to the clipboard, prints nothing secret, clears it after 30 s
```

Open a **private window** per role (or use a separate browser profile) so sessions do not mix. Type the e-mail shown (`phase2c.<name>@example.test`) and paste the password. The passwords live only in the git-ignored `.phase2c-accounts.local.json`.

## 3. Who does what

- **You drive** (works today): follow §5 and tell me the failures, or attach screenshots.
- **Hybrid** (I can inspect): you start the portal and sign in (I will not type passwords into a sign-in form that talks to the hosted project); I then navigate and capture the signed-in pages with the built-in browser if it can reach `localhost:3000` on your PC. I will test that reach when you confirm; if it cannot, you drive and I record.

## 4. What this stage cannot prove (decide before starting)

- **Forgot-password and set-password by e-mail.** The test accounts use `@example.test`; nothing can be delivered there (and the hosted default mail service only delivers to your team's own addresses). The form, its validation and its "request sent" behaviour can be checked; the link round-trip is NOT TESTED unless you attach a mailbox you own to one test account (your decision; not needed otherwise). Do **not** submit the set-password form while signed in as a test account: it would change the password stored for that account (rerunning `phase2c:verify` would reset it).
- **Paystack checkout/webhook:** disabled on purpose; the "pay" action answers "not configured". NOT TESTED.
- **Outgoing e-mail:** disabled; the server console logs `[email skipped]`.

## 5. Sequence (one role per window; note PASS/defect per line)

Expected navigation comes from the code's route policy (`lib/security/roles.ts`, `components/ux/admin-shell.tsx`).

### 5.1 Authentication (all roles)
1. `/login` signed out: password visibility toggle works; wrong password shows an error and does not reveal which part was wrong.
2. Signed out, open `/admin`, `/admin/invoices`, `/client`: each redirects to `/login`.
3. Sign in and check the landing page: Admin → `/admin`; Staff → `/admin`; Finance → `/admin/invoices`; Client → `/client`.
4. Refresh on a deep page stays signed in; browser back/forward behave; signing out returns to `/login` and Back does not show protected content.
5. `/forgot-password`: form validation and the submitted state (no e-mail will arrive).

### 5.2 Admin (`phase2c.admin`)
Navigation: Dashboard, Clients, Projects, Enquiries (Website enquiries / Booking requests / Calendar), Finance (Invoices / Payments / Reports), Planned → Systems and Operations (labelled Planned), Services, Team.
For each page: active state, same-tab navigation (no unexpected new tabs), buttons, dialogs (open, Esc, focus return), forms, search/filter, empty/loading/error states, no invented statistics or activity, no dead items or broken links, Back/Forward.
Admin-only: Team (invite form offers Staff and Finance only), Services create/edit/delete, invoice delete (draft).

### 5.3 Finance (`phase2c.finance`)
Nav shows only Clients, Projects (read-only) and Finance. Check: invoice list and detail (client/project context), Payments, Receipts, Reports totals against the tagged DEV data; create a draft, edit it, issue it, record a payment, open the receipt/PDF. **Keep new data to one test invoice** (tagged in the notes field `PHASE2C browser`). Then verify unavailable: Dashboard, Enquiries, Services, Team, Academy (direct URLs `/admin`, `/admin/leads`, `/admin/bookings`, `/admin/services`, `/admin/staff`, `/admin/academy` redirect to `/admin/invoices`); no edit/delete controls on Clients/Projects; no invoice delete.

### 5.4 Staff (`phase2c.staff`)
Nav: Dashboard, Clients, Projects, Enquiries, Planned, Services. No Finance, no Team. Direct `/admin/invoices`, `/admin/finances`, `/admin/reports`, `/admin/academy`, `/admin/staff` must redirect to `/admin`. Services list is readable with **no** add/edit/delete/price controls. No invoice, payment, receipt or total appears anywhere (dashboard, client page, project page).

### 5.5 Client A and Client B (separate windows)
Home, projects, milestones, updates, deliverables, bookings, invoices, payments, receipts. Confirm only own data; internal updates and hidden deliverables absent; draft invoices absent. Download a visible deliverable (valid signed link works; copy the link address into a fresh private window after expiry or edit it: must fail). Try the other client's record URL (copy an id from the other window): must not load. Invoice/receipt PDFs open for own issued invoices only.

### 5.6 Visual pass (each role, each new page type)
Desktop 1920×1080 and 1366×768, tablet 768×1024, mobile 390×844 (browser dev tools device mode). Check: typography, spacing, sharp corners, structured (not card-stacked) layout, tables (horizontal overflow handling), forms, dialogs, mobile drawer (open, focus trap, Esc, route change closes it), no page-level horizontal scroll, text wrapping, focus rings, keyboard-only use (Tab order, Enter/Space/Esc), button/link states.
Look for leftovers of the old portal: glass/blur, gradients, glow, particles, heavy shadows, large rounded cards, old dark/glass UI, Space Grotesk, fake visualisations, needless animation, inconsistent terminology (e.g. Finance vs Finances, Enquiries vs Leads, Clients vs Customers).

## 6. Defect record (one row per genuine defect; do not fix, do not redesign)

| # | Role/account | Page | Exact action | Expected | Actual | Severity (S1 blocker / S2 major / S3 minor / S4 polish) | Type (UI / routing / authorization / data / infrastructure) | Screenshot | Source file or route |
|---|---|---|---|---|---|---|---|---|---|

Results are reported in six groups: **A** PASS · **B** UX/UI defects · **C** functional defects · **D** authorization/security defects · **E** data/configuration issues · **F** future enhancements. An authorization defect (D) stops the session for review before anything else.

## 7. Stop conditions

Stop and tell me immediately if: the banner does not show the DEV ref; a Finance/Staff/Client page shows data it should not; any page shows production-looking data; a real e-mail or payment appears to have been attempted.

## 8. Afterwards

Stop the server (Ctrl+C). The test accounts and tagged data stay in DEV. `Remove-Item Env:PHASE2C_CONFIRM_DEV_WRITES` when finished.
