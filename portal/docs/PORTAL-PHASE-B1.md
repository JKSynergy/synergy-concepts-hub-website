# SCH Portal — Phase B1: Capture Films quotation inbox and Academy entry point

Status: local branch `portal/workspaces-phase-a`, on top of Phase A (`f3bedc9`). Not pushed or deployed.
No migration, RLS change, production data change, new tracking script or new credential.

## 1. Capture Films quotation inbox
Route: `/admin/services/capture-films/quotations`. In the navigation it is Capture Films, Quotations; there is a tab bar "Quotations | Price list".

- **Source:** `public.quote_requests` where `business = 'capture_films'`. This is the only reliable business identifier.
  - A lead or booking whose `service_interest` is `media` is **not** treated as Capture Films, because `media` also covers Creative Hub enquiries.
  - Plain website enquiries without a structured quotation are not in the inbox. They remain in Concepts Hub, Enquiries.
- **Columns:**
  - reference and submitted time;
  - customer (name, email, phone);
  - event, and event date (fixed or flexible);
  - customer estimate (UGX, or USD with UGX);
  - booking status;
  - latest review (final amount and when);
  - action.
- **Filters:** All, or Not reviewed (`?show=unreviewed`).
- **Workflow:** read-only.
  - "Review" (admins, unreviewed) and "Open" both go to the existing booking page, which shows the quotation snapshot and the existing review form (`add_quote_review`, admin only).
  - No second workflow, no new records, no writes from the inbox.
- **Access:**
  - **Middleware:** keeps finance out of `/admin/services`.
  - **Page:** requires admin or staff (`isOperationalStaff`).
  - **RLS:** `quote_requests_select_staff` and `quote_reviews_select_staff` (`is_staff()`: admin and staff only) return nothing to finance or clients.

  A database test against the real migrations confirms what each role gets.
- **Limits:** the newest 200 requests are listed. If a request's booking was deleted, the row shows "Booking removed" with no link; the quotation snapshot itself is immutable and kept.

## 2. Multimedia Academy: entry point, not a duplicate
The Academy workspace links (admin only, same tab) to the Academy's own system:
- **Academy system:** `https://synergymultimediaacademy.com/admin`
- **Website analytics:** `https://synergymultimediaacademy.com/admin/website-analytics`

Both open with the Academy's own sign-in.

`/admin/academy` (the SCH portal's older copy of the course list, `academy_courses`) is kept and relabelled "Legacy course list". Whether to retire it is a decision for the owner, not taken here.

### 2.1 Academy analytics audit (read-only, from the public website code, 22 Oct 2026)
**Already in place: first-party website analytics in the Academy system.**
- **Sending:** the public site (React app on Vercel) sends events to `sma-api-production.up.railway.app/api/analytics/track`. Each event carries:
  - an anonymous visitor ID (`localStorage sma_vid`) and a session ID (30-minute inactivity window);
  - the event type, page path and title, and referrer;
  - UTM `source` / `medium` / `campaign` / `term` / `content`, also read from `?source=` style parameters;
  - the device type, browser and operating system.
- **Not tracked:** signed-in users and the `/admin`, `/finance`, `/trainer`, `/student` and `/mentor` areas.
- **Events seen:**
  - `page_view`, `masterclass_view`, `advisor_opened`;
  - `masterclass_payment_started`, `masterclass_payment_proof_submitted`, `masterclass_registration_completed`;
  - the advisor's "application_started" action.

  Masterclass registrations also send `visitor_id`, `session_id`, UTM fields, landing page and referrer.
- **Reporting:** the Academy admin page "Website Analytics & Marketing Attribution" (`/admin/website-analytics`, data from `GET /api/admin/website-analytics`).
  - **Date range:** a selectable range in Africa/Kampala time.
  - **Sections:** unique visitors, sessions, page views, visitor trends, traffic sources (source / medium), top visited pages, device categories, UTM campaign performance, course discovery and admissions interest, leads, registrations, applications and conversions.
  - **Revenue figures:** "verified admissions cash" and "attributed revenue" appear only where verified by the Academy's admissions attribution. Elsewhere, estimated opportunity is labelled "not booked or guaranteed revenue".

| Priority metric | Source today | Status |
| --- | --- | --- |
| Website visits, unique visitors | Academy first-party analytics (`page_view`, visitor and session IDs) | **Measured**, in the Academy dashboard |
| Traffic sources (Google, TikTok, Instagram, referral, direct) | UTM tags plus referrer, classified on the Academy server | **Measured with limits**. The server-side classification rules were not visible from the website code. In-app browsers (TikTok, Instagram) often send no referrer, so untagged visits can appear as direct. UTM-tagged links are needed for reliable social attribution. |
| Course-page and intake-page visits | `page_view` page paths; "Top visited pages"; "Course discovery" | **Measured** (page level) |
| Application form starts | Only the advisor "application_started" action was found; no general form-start event | **Not reliably tracked.** Instrumentation needed. |
| Completed applications | Academy admissions records; dashboard "Applications" / "Registrations" | **Measured** in the Academy system. The exact definition was not verified from the website code. |
| Applications by course and intake | Academy admissions data | Expected in the Academy system (Admissions, Intakes). Not verified here. |
| Visitor-to-application conversion | Needs the visitor ID carried into the application | **Only partly supported.** UTM fields and the visitor ID are sent with masterclass registrations. They were not seen on the general intake application, so conversion is reliable for masterclasses only. |

**Not verified:** the actual figures and the exact server-side definitions. They need an Academy admin sign-in; none was used.

**Privacy:** the identifiers are first-party and the site sends no names to analytics. No cookie or consent notice was found in the site code. Whether one is required should be checked against the Uganda Data Protection and Privacy Act; this is not legal advice.

### 2.2 Why the figures are not shown inside the SCH portal
Showing them here would need an Academy API credential stored in the portal (server-side), plus agreement on which aggregated fields may be shared. That is a new external credential, so it was not added. If approved, the smallest safe version is:
1. **A read-only aggregates endpoint on the Academy API**, returning totals only: visitors, sessions, sources, top pages, and applications by course and intake, with no personal data.
2. **A scoped token stored as a Vercel environment variable for the portal.**
3. **A server-rendered "Academy traffic" summary card for admins,** labelled "Source: Academy first-party analytics" with the date range.

### 2.3 Smallest instrumentation additions, in the Academy system and only if approved
1. **Track form starts:** an `application_form_started` event on the first interaction with the intake application form.
2. **Attribute intake applications:** send `visitor_id`, `session_id`, UTM fields, landing page and referrer with intake applications (masterclass registrations already do this).
3. **Tag every social and ad link with UTM** (TikTok, Instagram, Google Ads), so sources do not depend on referrers.
4. **Review consent wording** for the analytics identifiers.

## 3. Dependencies for later business-level separation (unchanged, not implemented)
- **Capture Films is already separable:** `quote_requests.business`.
- **Records with no business field:** leads, bookings, projects, clients and invoices. See `PORTAL-WORKSPACES-PHASE-A.md`, section 5.
- **Creative Hub:** no workflows; untouched in this phase.
