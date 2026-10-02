# Phase 2B — Complete the portal visual + UX reset

Status: implemented and verified against a local mock backend. **Not deployed. No migrations run. No production data touched.**

## 1. What was rebuilt
Every screen now uses the Phase 2A shell and the `.ux` design system (Sora + Inter, 2px corners, hairlines, no gradients/glass/glow/pills/decorative charts).

| Area | Screens |
|---|---|
| Enquiries | Website enquiries (`/admin/leads`), Booking requests (`/admin/bookings`, detail, new request, Calendar) — tabs supplied by the shell; tables stay separate |
| Finance | Invoices (list, new, detail, edit), Payments (`/admin/finances`), Reports — one Finance tab set; all amounts in UGX from real rows |
| Settings | Services, Team (`/admin/staff`, labelled "Team") |
| Academy | Restyled but still hidden from navigation; routes and data untouched |
| Client portal | Shell, dashboard, projects (+detail, milestone actions), bookings (+new/cancel), invoices (+detail), profile |
| Project detail | Milestones, Assigned team, Updates, Deliverables rebuilt natively — the Phase 2A CSS bridge is gone |
| Auth pages | Forgot password, Set password on the shared auth shell |
| Dashboard | Real data only; no "New Clients", no "$" |
| Mobile drawer | Traps focus, Escape closes, focus returns to Menu, closed drawer removed from tab order (visibility hidden) |
| Fonts | Only Inter (400–700) and Sora (600/700) are requested. Built CSS contains exactly one Google Fonts request: `family=Inter:wght@400;500;600;700&family=Sora:wght@600;700`. Legacy Space Grotesk removed from Tailwind config |

Removed legacy files: `portal-sidebar`, `progress-bar`, `page-transition`, `sch-loader`, `loader-preview`, `dashboard-hero`, `kpi-card`, `today-overview`, the old dark/glass `globals.css`, and the `.ux-flatten` bridge.

## 2. What was preserved
- All server actions, API routes, Supabase clients, middleware, Paystack and finance libraries, `lib/types.ts` and migrations 001–010: byte-identical to the pre-2B versions (SHA-256 compared for `lib/actions`, `lib/supabase`, `lib/finance`, `lib/security`, `middleware.ts`, `app/api/paystack`, `lib/types.ts`).
- Authorization: staff still blocked from invoices/finances/reports/academy/team (middleware + page redirects); clients redirected from every `/admin` path.
- Data model: separate `leads` and `bookings` tables; no project type; Academy not retired.
- Same-tab rule: only allowlisted external opens remain (client's own external portal URL ×2, signed deliverable download URL).

## 3. Files / components changed (summary)
- Shell: `components/ux/{app-shell,admin-shell,client-shell,auth-shell,dialog,feedback,primitives}.tsx`, `components/nav-progress.tsx`, `app/ux.css`, `app/globals.css`, `app/layout.tsx`, `tailwind.config.ts`
- Admin: `app/admin/{leads,bookings,services,staff,academy,invoices,finances,reports}/**`, `app/admin/projects/[id]/{page,milestones-section,staff-assignments}.tsx`, `components/{updates-section,deliverables-section,invoice-actions,line-items-manager}.tsx`
- Client: `app/client/**`
- Auth: `app/forgot-password/page.tsx`, `app/auth/set-password/page.tsx`
- Tests: `tests/ui-guards.test.mjs`

## 4. Tests run
Automated (device, clean copy):
- `npx tsc --noEmit`: clean
- `npm test`: **94/94 pass** (88 DB/logic tests on PGlite with migrations 001–010, plus 6 UI guards: no internal new tab, no `alert()`/`confirm()`, shared-Dialog-only modals, no route-transition animation library, Academy not in nav, no invented dashboard metrics)
- `npm run build`: succeeds (one pre-existing Edge-runtime warning from `@supabase/supabase-js`)

## 5. Browser verification performed
Method: real Chromium (Playwright) against `next dev` with a local mock Supabase (password auth for admin/staff/client, no RLS) and test data only.
- 104 page loads (admin: 15 list pages + 4 detail pages; client: 5 pages + 2 detail) at 1920×1080, 1366×768, 768×1024, 390×844: no HTTP errors, **no horizontal overflow**.
- Admin: login, every nav item, Enquiries and Finance tabs, logout. Staff: permitted pages load; invoices/finances/reports/team/academy/new-invoice redirect to `/admin`; logout, then `/admin` → `/login`. Client: every `/admin` path redirects to `/client`; logout.
- Navigation: zero extra tabs; back ×3 / forward land on the expected pages; refresh and deep link keep the page.
- Accessibility: skip link is the first Tab stop and moves focus to main; drawer focus moves into it, Tab never leaves it, Escape closes it and focus returns to Menu; closed drawer not tabbable; dialogs focus first field, Escape closes, focus returns to the trigger; confirmation dialog (Archive client) and toast render with correct tokens.
- Screenshots reviewed as one application: login, dashboard, clients, project detail, enquiries, invoices, payments, reports, team, client dashboard, mobile drawer, mobile invoices.

Defects found and fixed during 2B verification: FeedbackProvider was outside the `.ux` scope (confirm/toast tokens undefined); numeric column butted against the next column in Clients; search inputs too narrow (placeholder clipped); stale guard test after deleting legacy files; guard tripped by a local `confirm` variable (renamed).

## 6. Remaining known issues / limits
- **Not verified against real Supabase/RLS.** The mock has no RLS; RLS is only covered by the PGlite tests. A run against a real dev project is still advisable.
- Draft invoices created against the mock showed `UGX NaN` (mock has no total-recalculation trigger; real schema defaults to 0). Not reproducible in the schema, but worth a glance on real data.
- Convert-lead and Add-team-member submit paths could not be exercised end to end on the mock (they call auth admin APIs).
- Google Fonts could not load in the sandbox; the production request is verified from the built CSS, not seen rendering.
- Team page lists role=staff only and has no edit / remove / deactivate / account-status column: the current actions and schema don't provide them (see decisions).
- Booking requests fall back to "Unknown requester" where neither client nor contact fields exist.
- `framer-motion` and `lucide-react` are now unused dependencies (not removed; no dependency changes were requested).
- Invoice status actions on the invoice detail page were re-wired by the Finance rebuild to the existing `setInvoiceStatus` action; **please confirm the resulting workflow (draft → sent → cancel/mark paid) matches your intent.** The action itself is unchanged.

## 7. Decisions needing Joseph's input
1. Academy: retire or keep (currently hidden, routes/data intact).
2. Enquiries: merge `leads` and `bookings` into one table, or keep two views.
3. Project type field.
4. Client portal: navigation model and any new capabilities (currently functionally identical, restyled).
5. Team: which account actions and statuses admins should have (deactivate, change role, resend invite) — needs a schema/authorization decision.
6. Invoice status workflow confirmation (item above).
7. Remove unused dependencies (`framer-motion`, `lucide-react`).
