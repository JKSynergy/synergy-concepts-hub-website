# SCH Portal — Business workspaces, Phase A (navigation only)

Status: implemented locally on branch `portal/workspaces-phase-a`. Not pushed or deployed.
Scope: the admin navigation shell. No route, API, role, RLS policy, migration or record was changed.

## 1. What changed
- The admin sidebar is grouped as **Businesses** (Concepts Hub, Capture Films, Creative Hub,
  Multimedia Academy) then **Shared services** (Customers and contacts, Finance, Action Center,
  Administration). Source of truth: `lib/navigation/workspaces.ts`.
- The current workspace label turns orange; the current page keeps `aria-current="page"` and the
  orange bar. The brand line and the mobile top bar name the workspace (for example
  "Synergy Capture Films", "Synergy Shared: Finance").
- Section tabs (Enquiries, Finance, Systems, Operations) are unchanged.
- Multimedia Academy is a workspace again. This reverses the Phase 2 IA decision
  (`PORTAL-PHASE2-IA.md`) that hid `/admin/academy`; access is still admin-only.
- The client portal shell is unchanged (all new shell options are optional).

Hiding a link is not authorisation. Every page keeps its server-side role check, the middleware
keeps `adminRouteRedirect()`, and the database keeps RLS. A test asserts that no role is shown a
link the middleware would redirect it away from.

## 2. Route-to-workspace map (admin)
Roles: A admin, S staff, F finance. "Guard" is the existing check (page + middleware).

| Route | Workspace / area | Nav label | Shown to | Guard (unchanged) |
| --- | --- | --- | --- | --- |
| `/admin` | Concepts Hub | Dashboard | A S | operational staff; finance redirected to invoices |
| `/admin/leads`, `/admin/bookings`, `/admin/bookings/[id]`, `/admin/bookings/calendar` | Concepts Hub (cross-business enquiries) | Enquiries | A S | operational staff |
| `/admin/projects`, `/admin/projects/[id]` | Concepts Hub (cross-business) | Projects | A S F | internal; finance read-only |
| `/admin/support` | Concepts Hub | Support | A S F | internal |
| `/admin/systems` and `/providers`, `/reconciliation`, `/monitoring`, `/events`, `/automation`, `/[id]` | Concepts Hub (technology services) | Systems | A S | internal; root operational staff |
| `/admin/services/capture-films` | Capture Films | Price list | A S | operational staff; editing admin only |
| (none) | Creative Hub | note, no link | A S | not applicable |
| `/admin/academy` | Multimedia Academy | Courses | A | admin only |
| `/admin/clients`, `/admin/clients/[id]` | Shared: Customers and contacts | Clients | A S F | internal; finance read-only |
| `/admin/agreements`, `/admin/agreements/[id]` | Shared: Finance | Agreements | A S F | internal |
| `/admin/invoices` (+ `new`, `[id]`, `[id]/edit`), `/admin/finances` (+ `packages`, `provider-costs`), `/admin/reports` | Shared: Finance | Invoices and payments | A F | finance access; staff blocked |
| `/admin/operations/action-center` | Shared: Action Center | Action Center | A S F | internal |
| `/admin/operations` (+ `tasks`, `incidents`, `backups`, `suspensions`, `provider-actions`) | Shared: Administration | Operations | A S F | internal |
| `/admin/services` | Shared: Administration | Services | A S | operational staff; editing admin only |
| `/admin/staff` | Shared: Administration | Team | A | admin only |

Client routes (`/client`, `/client/bookings`, `/client/invoices`, `/client/projects`, `/client/profile`),
auth routes and APIs (`/api/quote`, `/api/quote/catalog`, `/api/paystack/*`, `/api/invoices/*`,
`/api/receipts/*`, `/api/admin/*`, `/api/agreements/*`, `/api/systems/*`, `/api/provider-events/*`,
`/api/internal/*`) are outside the admin shell and unchanged.

## 3. Routes and workflows that do not exist yet (recorded, not linked)
- **Capture Films**
  - There is no quotation-request inbox. Quote requests are bookings in the shared Enquiries list.
  - The bookings list has no business filter and no URL filter to deep-link to.
  - Quote review exists only on the booking detail page.
- **Creative Hub:** there are no screens. Creative work, if any, sits in the generic Projects list.
- **Multimedia Academy:** only the course catalogue exists (`academy_courses`, admin only). Several things the brief expects don't exist in this portal:
  - screens for students, admissions, attendance, trainers or academy finance;
  - matching tables for them.

  `academy_enrollment` bookings appear in the shared Enquiries list.
- **Concepts Hub:** the dashboard and the lists are cross-business. There is no per-business summary.

## 4. Business ownership of records (audit)
| Record | Business identifier today | Reliable? |
| --- | --- | --- |
| `leads` | `service_interest` code: `systems` / `media` / `products` / `other` | Partly. `media` covers Capture Films and Creative Hub. |
| `bookings` | `type` (`academy_enrollment` means Academy); `metadata.business` (free text, website intake only); a linked `quote_requests` row means Capture Films | Only for Academy enrolments and Capture Films quotations |
| `quote_catalogs`, `quote_requests`, `quote_reviews` | `business` column, constrained to `capture_films` | Yes |
| `academy_courses` | the table itself | Yes |
| `projects`, `service_catalog`, `profiles` (clients), `invoices`, `payments`, `agreements` | none | No |

No existing record was assigned to a business.

## 5. Permission gaps for a later, reviewed phase
1. **No business-scoped roles.** Every admin and staff user sees every business's records. Finance sees finance for all businesses. RLS has no business dimension.
2. **Separating records by business needs schema and RLS changes:**
   - a `business` column or ownership table for leads, bookings, projects, services, clients and invoices;
   - a backfill rule for existing rows;
   - policies that use it.

   These were not implemented; they need their own migration review, backup and rehearsal.
3. **Finance can open some Systems screens it isn't shown.** Finance may open `/admin/systems/providers`, `/reconciliation`, `/monitoring`, `/events` and `/automation` (`FINANCE_ALLOWED_PREFIXES`), but the navigation does not link them. This was already the case and is unchanged; decide whether to show them or remove the access.
4. **Staff can read the Capture Films price list.** Staff may open it read-only. Editing it, the exchange rate, discounts and final amounts stay admin-only.

## 6. Decisions needed before Phase B
1. **Academy:** confirm that students, admissions, attendance, trainers and academy finance should be built in this portal. Phase 2 had treated the Academy as a separate product.
2. **Creative Hub:** say what its first screens are, and how a creative lead or project is identified.
3. **Capture Films inbox:** approve a filtered quotation inbox. It can be built from the existing `quote_requests` table without schema changes.
4. **Business ownership:** choose the identifier and the backfill rule for existing records, and whether to add business-scoped staff access.
