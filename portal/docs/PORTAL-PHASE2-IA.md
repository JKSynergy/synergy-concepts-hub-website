# Portal Phase 2: information architecture, visual and UX reset

Baseline: the "SCH Portal & Admin System Audit" (29 Sep 2026). Nothing here contradicts it. Phase 1 security work is untouched. This is a presentation and navigation change; no schema, data or API change.

## 1. Current portal audit summary (from the audit, checked against code)
- Functional client/admin app for enquiries, bookings, projects, invoices and payments. No concept of systems, hosting, domains, databases, backups, maintenance, support, tasks, costs or contracts.
- Flat navigation mixing unrelated things; Leads, Quote Requests, Bookings overlap; Finances and Reports overlap; Academy sits beside client billing.
- Legacy visual language: glass cards, gradients, glow, particles, heavy shadows, pills. Login used the same, with invented preview numbers.
- Every route change waited about 0.7 s for an exit/entrance animation, plus a full-screen loader.
- Native `alert()` / `confirm()` for deleting invoices; a dead "Remove staff" stub.

## 2. Route inventory (admin)
| Route | Purpose | State after this phase |
|---|---|---|
| /login | Sign in | Rebuilt |
| /admin | Dashboard | Rebuilt (real data only) |
| /admin/clients, /admin/clients/[id] | Clients | Rebuilt |
| /admin/projects, /admin/projects/[id] | Projects | Rebuilt (list, header, dialogs); sections bridged |
| /admin/leads | Website enquiries | Legacy look, new name and place |
| /admin/bookings, /admin/bookings/[id], /admin/bookings/calendar | Booking requests, calendar | Legacy look, new names |
| /admin/invoices (+ new, [id], [id]/edit) | Invoices | Legacy look; delete uses new confirm and toast |
| /admin/finances | Payments | Legacy look, renamed "Payments" |
| /admin/reports | Reports | Legacy look, now a tab of Finance |
| /admin/services | Service catalogue | Legacy look, moved under Settings |
| /admin/staff | Team | Legacy look, renamed; dead Remove button removed |
| /admin/academy | Academy (SMA) | Hidden from navigation; route and data kept |
| /admin/systems | Systems | New placeholder, no data |
| /admin/operations | Operations | New placeholder, no data |
Client portal (/client/*), auth routes and all /api routes: unchanged.

## 3. Navigation inventory
Before: 11 flat items including Academy and both Finances and Reports.
After (9 items, admin): Dashboard, Clients | Work: Projects, Enquiries | Money: Finance | Planned: Systems, Operations | Settings: Services, Team.
Staff do not see Finance or Team. Section tabs: Enquiries (Website enquiries, Booking requests, Calendar); Finance (Invoices, Payments, Reports).
Costs is not shown: there is no costs table.

## 4. Terminology map
| Before | Now |
|---|---|
| Control Center / Command Center / Overview | Dashboard |
| Leads / Quote Requests / Custom Requests | Website enquiries (inside Enquiries) |
| Bookings | Booking requests (inside Enquiries) |
| Finances | Payments (inside Finance) |
| Reports | Reports (a Finance tab) |
| Staff | Team |
| Academy | Removed from SCH navigation (SMA is a separate product) |
| Service catalogue | Services (Settings) |

## 5. Visual design system
Defined in `app/ux.css` under `.ux`. Navy #0B0F19, ink #161B26, stone #F4F3F0, hairline #E1DFDA, orange #ED8C22 (fill) / #B25B00 (text), blue #1773B9 (links, focus). Sora for titles, Inter for the interface. 2px radii, no gradients, one shadow only (dialogs, toasts). Status is text with a square marker, never a pill. Tables have a navy header rule and hairline rows, and stack into labelled rows below 768px. Sidebar collapses to a top bar with a menu below 1024px. Motion: 120 ms colour transitions only, disabled under reduced-motion.
Feedback (`components/ux/feedback.tsx`): toasts for outcomes, a promise-based confirm dialog for destructive actions. Focus rings, skip link, `aria-current`, labelled nav regions, Escape closes dialogs.

## 6. Dashboard concept
"What needs attention?" Attention, Recent work, Upcoming. Every row is a database query; empty is allowed. Categories not in the database (maintenance, support, tasks) are not shown.

## 7. Login
Two panes: navy brand panel and a plain form. No glass, gradient, glow, particles, preview cards or figures; no dead "Remember me"; password show/hide; the forced 300 ms "Welcome back" delay is gone. Authentication logic, error messages, invite and recovery handling are unchanged.

## 8. Same-tab navigation
Audit of `target="_blank"`, `window.open`, `window.location` and raw internal anchors:
- Kept (genuinely external): client's own external portal URL (admin client page, client profile) and the signed download URL for deliverables.
- Fixed: raw `<a href="/login">` on set-password now uses client-side navigation. Login uses `Link` and `router.push`.
- Paystack `window.location.href = authorization_url` is a redirect to Paystack in the same tab; unchanged.
- `tests/ui-guards.test.mjs` fails the build if an internal new-tab, `alert()` or `confirm()` is introduced.
Speed: the page transition wrapper is now a pass-through; admin and client `loading.tsx` no longer show the full-screen loader. Only the thin progress bar remains.

## 9. Routes retained / moved / hidden
Retained: everything. Moved (navigation only): Services to Settings, Reports to a Finance tab, Bookings and Leads into Enquiries. Hidden: /admin/academy (not linked; reachable by URL, admin only as before). No route was deleted.

## 10. Systems and Operations architecture
Placeholders at /admin/systems and /admin/operations describe the model: Client > System (website or application) > Infrastructure (hosting, domain, database, backups; no secrets stored) > Operations (maintenance, support, tasks) > Commercial (costs, contract, invoices). No fake records. Client detail carries a Systems section stating the same. Projects can later gain a type (creative or technology); no column was added.

## 11. Deferred
Restyling of Enquiries, Invoices, Payments, Reports, Services, Team, booking detail, invoice forms and the client portal (Phase D). Native rebuild of milestone, deliverable, update and staff-assignment sections (currently flattened by the `.ux-flatten` bridge). Systems, infrastructure, maintenance, support, tasks, costs, contracts, recurring billing, integrations and monitoring. Merging the lead and booking tables (documented duplication: `bookings.client_id` is nullable while `projects.client_id` is required; convert-booking flow needs its own fix).

## 12. Open decisions
1. Confirm Academy is fully out of the SCH portal (the route is kept for now).
2. Whether the client portal gets the same shell in Phase D.
3. Whether "Enquiries" should eventually be a single table, which needs a data migration.
4. Project type (creative or technology): column or tag.
