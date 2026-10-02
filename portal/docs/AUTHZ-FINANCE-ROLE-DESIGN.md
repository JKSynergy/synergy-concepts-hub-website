# Authorization: Finance role, finance-table RLS, Services, invoice lifecycle

Status: **implemented and tested on real PostgreSQL (PGlite, migrations 001–012). Not yet applied to any hosted Supabase project.** Nothing deployed; production untouched.

## 1. What changed and why
Migration 010 let *staff* read every invoice, payment and receipt, and (since 003) write the service catalogue. The confirmed decisions replace that with a dedicated **finance** role, database-level exclusion of staff from finance data, admin-only service writes, and two new invoice-lifecycle rules.

## 2. Migrations (apply in order, to the DEV project first)
| File | Content |
|---|---|
| `011_add_finance_role.sql` | `ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'finance'` only (an enum value cannot be used in the transaction that adds it). |
| `012_finance_role_authorization.sql` | `is_finance()`, `can_access_finance()`; finance-table policies; finance read of client profiles/projects/milestones; services writes admin-only; number RPCs for admin/finance; new lifecycle rules in `invoices_status_guard`. Idempotent (`DROP POLICY IF EXISTS`, `CREATE OR REPLACE`). |
Rollback: enum values cannot be removed. Move finance users back to `staff`, then re-create the 010 policies. Migrations 001–010 are unchanged.

## 3. Permission matrix
| Capability | Admin | Finance | Staff | Client |
|---|---|---|---|---|
| Invoices: read | all | all | **none** | own, not draft |
| Invoices: create / edit / issue (mark sent) / mark overdue / cancel (per lifecycle) | yes | yes | no | no |
| Invoices: delete a draft with no payments | yes | **no** | no | no |
| Line items: read / write | all / yes | all / yes | none / no | own, not draft / no |
| Payments: read / record | all / yes | all / yes | none / no | own settled / no (Paystack path unchanged) |
| Receipts: read | all | all | none | own |
| Financial reports (built from the tables above) | yes | yes | no | no |
| Invoice/receipt PDFs | yes | yes | no | own, not draft |
| Clients (client profiles): read | yes | **read-only** | yes | own |
| Clients: create / edit / archive | yes | no | create/edit (archive admin) | no |
| Projects and milestones: read | all | **read-only, all** | assigned | own |
| Project updates, deliverables, assignments, leads, bookings | yes | **no** | yes | own/visible |
| Services: read | yes | no page (route redirected) | **yes (read-only)** | active only |
| Services: create / edit / delete / reprice | yes | no | **no** | no |
| Team page, roles, Academy, audit log | yes | no | no | no |
| Assign / remove the finance role | **admin only** | no | no | no |

Notes: finance is deliberately **not** `is_staff()`, so it gets no operational rights. Finance reads only `role = 'client'` profiles (not staff/admin). Role changes remain guarded by `guard_profile_update` (admin only, never on oneself); sign-up metadata can never set a role. Archived finance/admin users lose access at the database. The Team forms can assign only `staff` or `finance` (never admin/client), server-side.

## 4. Finance-table RLS (after 012)
- `invoices`, `invoice_line_items`, `payments`, `receipts` SELECT: `can_access_finance()` OR the owning client (non-draft; payments settled only).
- INSERT/UPDATE: `can_access_finance()` (invoices, line items, payments; payments UPDATE only unsettled, enforced by the existing guard). Receipts have no write policy (trigger-created). No DELETE on payments. Invoice DELETE: admin only (draft without payments, existing trigger).
- `document_counters`: no policies (unchanged). `audit_logs`: admin read (unchanged).

## 5. Invoice lifecycle (database trigger is the source of truth)
`draft → sent → partially paid → paid` (the last two follow recorded payments).
1. An issued invoice (any status other than draft) can never return to draft.
2. A paid or partially paid invoice, or one with recorded payments, cannot be cancelled.
3. Paid / partially paid can be reached only through recorded payments (unchanged from 010).
4. With recorded payments an invoice cannot return to sent/overdue/draft (unchanged).
5. No void/correction workflow was introduced; issued records are preserved. Applies to every caller including the service role (Paystack settlement still works and is unchanged).
Layers: `invoices_status_guard` trigger (DB) → `lib/finance/lifecycle.ts` used by `setInvoiceStatus` for readable errors → UI hides/disables impossible actions (`availableInvoiceActions`). A parity test compares app and database on every transition.
Still allowed (not restricted by the decisions): draft/sent/overdue → cancelled while unpaid; cancelled → sent; overdue ↔ sent.

## 6. Application changes
- `lib/security/roles.ts`: single module for all role checks and the `/admin` route policy (`adminRouteRedirect`); no role string comparisons remain elsewhere (enforced by a test).
- Middleware, admin navigation, invoice/payment actions, PDF routes, API routes, pages, Services and Team all use it. Finance lands on `/admin/invoices`; its nav is Clients, Projects, Finance. Staff nav has no Finance.
- Team: role selector (Staff / Finance) on invite and manual-create; list shows both roles.
- Services: read-only for staff (no add/edit/toggle in UI, server actions refuse, database refuses).
- Paystack code, webhook and payment logic: untouched.

## 7. Known limits
- Removing or changing a team member's role has no UI (no Team account actions were decided); it is an admin-only database operation, enforced by RLS and the profile guard.
- Finance sees project detail without updates/deliverables/assignments (they are staff-only by RLS).
