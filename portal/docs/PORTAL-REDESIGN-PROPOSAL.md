# SCH Portal: Visual and UX Reset (Admin), Proposal A–K

Status: proposal and first slice. Nothing here is deployed. Phase 1 security controls are untouched (auth, roles, RLS, finance/Paystack paths, audit logging, all APIs).

Assumption: the earlier information-architecture brief was not part of this attachment, so the navigation below is derived from this brief plus the routes and tables that exist today. It reserves room for Systems, Tasks and Maintenance but builds none of them.

## A. Current portal assessment (from code, not screenshots)

Screenshots were not possible: every admin screen sits behind sign-in and I do not use your credentials. This is read from the source.

- **Visual language:** "premium dark glass". A deep-navy page with two full-screen radial glows and a masked grid overlay (`.portal-shell::before/::after`), translucent gradient panels with 18px radii, backdrop blur and deep shadows (`.glass-card`, `.kpi-card`), radial glow blobs inside KPI cards, hover-lift transforms, gradient primary buttons with glow. Tailwind config still ships float, pulse-glow and particle-drift animations.
- **Fonts:** Sora headings and Inter body (already aligned with the public site), plus Space Grotesk for labels.
- **Structure:** a single 264px glass sidebar with 11 icon-led items (Dashboard, Clients, Projects, Bookings, Services, Quote Requests, then admin-only Staff, Academy, Invoices, Finances, Reports). Every item has an icon; active state is a bright blue treatment.
- **Dashboard:** hero banner, three KPI cards, a "today overview" and a bookings list. Counts are real, but the composition answers "how are we doing" rather than "what needs my attention".
- **Lists/details:** every table and every information block sits in its own rounded glass card. Clients list is a six-column table inside a card; client detail is three stat cards and two more cards.
- **Legacy mechanism (matters for migration):** `globals.css` re-maps Tailwind light classes (`bg-white`, `text-gray-900` and about 40 more) to dark equivalents under `.portal-shell`. Unmigrated pages therefore cannot simply be dropped onto a light background.

## B. Route inventory (from the production build)

| Area | Routes |
|---|---|
| Admin (18) | `/admin`, `/admin/clients`, `/admin/clients/[id]`, `/admin/projects`, `/admin/projects/[id]`, `/admin/bookings`, `/admin/bookings/[id]`, `/admin/bookings/calendar`, `/admin/leads`, `/admin/services`, `/admin/staff`, `/admin/academy`, `/admin/invoices`, `/admin/invoices/new`, `/admin/invoices/[id]`, `/admin/invoices/[id]/edit`, `/admin/finances`, `/admin/reports` |
| Client (7) | `/client`, `/client/projects`, `/client/projects/[id]`, `/client/bookings`, `/client/invoices`, `/client/invoices/[id]`, `/client/profile` |
| Public/auth (5) | `/login`, `/forgot-password`, `/auth/set-password`, `/auth/callback`, `/auth/confirm` (+ `/loader-preview`) |
| API (13) | admin clients/staff/invite, invoices and receipts PDF, Paystack initiate/webhook, quote |

`/admin/invoices`, `/admin/reports`, `/admin/academy` remain admin-only in middleware.

## C. Proposed navigation

Eleven flat items become five primary items and one small secondary group. Sub-sections become contextual tabs shown by the shell, so existing pages need no edits.

```
PRIMARY                     CONTEXTUAL TABS (shown under the page header)
Overview                    -
Clients                     -
Projects                    -
Enquiries                   Bookings | Quote requests | Calendar
Finance (admin)             Invoices | Finances | Reports

MANAGE (small, below a rule)
Services · Staff (admin) · Academy (admin)
```

Rules: text-only navigation (no icons, none that need explaining), the active item is white with a 2px orange rule, everything else is muted. No nesting, no badges.

**Reserved, not built:** an "Operations" group (Systems, Tasks, Maintenance and Support) appears only when those tables exist.

## D. Visual design direction

One family with the public site: dark navy, white, warm stone, restrained orange, Sora for titles, Inter for the interface, sharp geometry, hairline rules.

| Token | Value |
|---|---|
| Navy / Navy 2 | `#0B0F19` / `#111827` (sidebar) |
| Ink / Muted | `#161B26` / `#5B6472` |
| Paper / Stone / Line | `#FFFFFF` / `#F4F3F0` / `#E1DFDA` |
| Accent | orange `#ED8C22` fills on dark and buttons; `#B25B00` orange as text on light |
| Link | `#1773B9` |
| Status | text plus a small square marker, never a filled pill: success `#1B7F4B`, warning `#B25B00`, danger `#B3261E`, neutral muted |
| Radii / shadows | 2px on controls, 0 elsewhere; no shadows except dialogs |
| Type | Sora 600: page title 28/32, section 13 uppercase eyebrow. Inter: body 14/22, table head 11 uppercase, +0.08em |
| Spacing | 4px base; page padding 40px desktop, 20px mobile |
| Motion | 120ms colour/border transitions and the existing thin top progress bar only |

Cards are replaced by sections: eyebrow heading, hairline rule, content. A bordered container is used only for dialogs.

## E. Admin shell wireframe

```
┌───────────────┬─────────────────────────────────────────────┐
│ SYNERGY       │  ENQUIRIES › Bookings                        │  (optional context line)
│ Concepts Hub  │                                              │
│               │  Bookings                        [ New ]     │  page title + one primary action
│ Overview      │  Consultations and service bookings.        │  one-line description
│ Clients       │  ─────────────────────────────────────────── │
│ Projects      │  Bookings  Quote requests  Calendar          │  contextual tabs
│ ▌Enquiries    │  ─────────────────────────────────────────── │
│ Finance       │  content: tables, rows, sections             │
│ ───────────   │                                              │
│ Services      │                                              │
│ Staff         │                                              │
│ Academy       │                                              │
│               │                                              │
│ J. Kamya      │                                              │
│ Administrator │                                              │
│ Sign out      │                                              │
└───────────────┴─────────────────────────────────────────────┘
desktop ≥1024px: 232px fixed navy sidebar · <1024px: top bar + slide-in drawer (focus-trapped, Esc closes)
```

## F. Dashboard wireframe (real data only)

```
Good morning, Joseph.
Here is what needs attention today.

ATTENTION ─────────────────────────────────────────────────
Projects     2 with revisions requested · 1 in review          →
Enquiries    3 bookings pending · 2 new quote requests          →
Invoices     1 overdue · 2 drafts not sent                      →   (admin only)
(a row appears only when there is something to act on; otherwise "Nothing needs attention.")

RECENT WORK ──────────────────    UPCOMING ───────────────────
Update on <project>, <who>, <when>  Booking: <title>, <client>, <date/time>
New booking: <title>, <when>         Invoice due: <number>, <client>, <date>
...                                  Project target date: <title>, <date>
```

Tasks, Maintenance, uptime and revenue charts are omitted because there is no data model for them. The old hero, KPI cards and the "revenue this month" figure are retired.

## G. Representative list page: Clients

Title, one-line description, `Add client` (primary) and `Invite` (secondary), a search box (client-side filter over the loaded list), then a plain table: **CLIENT** (company, with contact name under it), **CONTACT** (email, phone), **ACTIVE WORK** (count of active or review projects), **OUTSTANDING** (open invoice balance, admin only), **SINCE**; row actions in a quiet "⋯"-free inline text form (Open, Edit, Archive). Hover shows a stone row. Empty state is one sentence and one action. Below 768px the table becomes stacked rows (client name, then contact, then meta).

## H. Representative detail page: Client

Header (name, contact line, actions), then sections separated by rules, not cards: **Overview** (contact and billing details as a definition list), **Active work** (projects with status marker and progress), **Commercial** (open invoices with balance, admin only), **Activity** (latest project updates and bookings), **Systems** (reserved placeholder, hidden until data exists). Everything a person needs about the relationship is on one page.

## I. Route mapping

| Existing route | New home | This slice |
|---|---|---|
| `/admin` | Overview | **rebuilt** |
| `/admin/clients`, `/[id]` | Clients | **rebuilt** |
| `/admin/projects`, `/[id]` | Projects | new shell, page unchanged |
| `/admin/bookings`, `/[id]`, `/calendar` | Enquiries, tab Bookings/Calendar | new shell, page unchanged |
| `/admin/leads` | Enquiries, tab Quote requests | new shell, page unchanged |
| `/admin/invoices*`, `/finances`, `/reports` | Finance, tabs | new shell, page unchanged |
| `/admin/services`, `/staff`, `/academy` | Manage | new shell, page unchanged |
| `/client/*` | unchanged (client portal is not in this reset) | not touched |

Unmigrated pages keep their old look inside a contained dark frame under the new shell so nothing becomes unreadable. They are migrated one at a time using the new system.

## J. Unchanged functionality

Authentication and role redirects; middleware protections and the admin-only routes; all RLS and database triggers (migration 010); every API route and server action; the Paystack flow; audit logging; client archive and restore; add, edit, invite, resend-invite and archive actions on clients (same requests, restyled); invoices, payments and PDFs; the client portal.

## K. Deferred

Restyling of all other admin pages (Projects, Bookings, Leads, Invoices, Finances, Reports, Services, Staff, Academy) and the client portal; global search; a real Systems, Tasks, Maintenance and Support workspace (needs data models first); dark mode; sortable/filterable tables beyond the Clients search; removal of the legacy dark CSS (only possible after the last page is migrated); the login page (not part of this brief).
