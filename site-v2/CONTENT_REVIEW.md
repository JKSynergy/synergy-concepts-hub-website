# Content review before production deployment

Nothing here is a design change. Business items are switched off in `build.py` until confirmed.
Portfolio images are gated separately by `_review/portfolio.json` (see "Portfolio images" below).

| Item | Current state | To publish |
| --- | --- | --- |
| Selected clients line (QuickCredit, Afrisites, Octagon Africa, Elgon Bottling, Ecotrust, Diani Art Gallery) | Hidden (`SHOW_SELECTED_CLIENTS = False`) | Confirm each name is approved for public display, then set to `True` and rebuild. No other names to be added. |
| Social Media Content packages | The old "To be confirmed" package table has been removed. The page now says pricing is quoted after a consultation and that fixed packages with starting prices are being finalised. Content production and account management are described as separate services; nothing about management scope is promised. | Confirm quantities, scope boundaries, platforms, revisions, turnaround, minimum term and starting prices (list in the Oct 2026 delivery report). Then add a package table to `sm_body` in `build.py`. Do not reuse the old site's prices or promises. |
| Wedding and ceremony photography | Business has approved weddings on this site. The five proposed wedding images are **pending** in `_review/portfolio.json` (couple consent not documented). | Record couple consent for each image, set its status to `approved`, run `build_images.py`, then `build.py`. The Weddings & ceremonies section appears automatically once one image is approved. |
| Testimonials and case-study outcomes | None on the site. Case-study pages (Matsen, Rotary) exist only in the review preview, with brief, role and deliverables marked "To be supplied". | Supply the facts and client approval; fill `cases` in `_review/portfolio.json` and set the case and all its pages to `approved`. |
| About page founder/company story | Hidden placeholder comment. | Supply real information. |
| SMA Sync | "In use", no download, buy, pricing or sign-up. Homepage now shows Products as two short rows instead of three cards. | Unchanged unless Synergy decides to release it. |
| Work page client project links and names (QuickCredit, Solverscreations, Afrisites, Octagon Africa, Elgon Bottling, Diani Art Gallery, Davy Cinematography) | Carried over from the existing public site. Synergy's role on Davy Cinematography (video production or website) is not stated. | Confirm they remain approved for display, and clarify the Davy entry. |

## Business ownership decisions from the Oct 2026 reorganization (confirm or correct)

| Item | Decision taken | To confirm |
| --- | --- | --- |
| Social Media Content and Campaign & Content Production | Placed under Synergy Creative Hub (previously shown under "Creative" without a business name). | Confirm Creative Hub owns these, or move them to Capture Films in `BUSINESSES` / `FORM_GROUPS`. |
| Videography | Synergy Capture Films service page: event and ceremony films, business, promotional and campaign video, social media video and Reels. No video portfolio on the site; links to the Capture Films YouTube channel. | Add approved video work or stills if wanted. |
| Capture Films core offer (confirmed by the business, Oct 2026) | Photography and videography for events (corporate events, conferences, celebrations), weddings, Kukyala and introduction ceremonies. New page `/capture-films/events/`; `/capture-films/weddings/` now covers weddings, Kukyala and introductions (Kwanjula). | No event (non-wedding) portfolio images are approved yet: add some to `_review/portfolio.json` when available. Kukyala and introduction (Kwanjula) descriptions confirmed by the owner, 21 Oct 2026. |
| Drone coverage | Described only as an optional inclusion in suitable photography and videography packages, "where the venue and conditions allow". No prices, package names, permissions or guarantees. | Wording confirmed by the owner, 21 Oct 2026. |
| Photo books, animation and motion graphics | Not listed anywhere: no existing site content or documentation supports them. | Confirm which are offered before adding them. |
| Capture Films quotation builder (built, Oct 2026) | `/capture-films/quote/`: event, services, extras with a running total, UGX/USD, date/venue/logistics, contact, review, submit. Prices are the business-supplied list, loaded live from the portal (`/api/quote/catalog`); the simple form remains below it and is used automatically if the price list cannot load. | See "Quotation builder: open business decisions" below. |
| Academy highlights on `/academy/` | Courses and intakes, monthly masterclass, Project Lab and holiday/other programmes, each linking to a page on synergymultimediaacademy.com verified on 21 Oct 2026 (`/programs`, `/intake`, `/masterclass`, `/project-lab`, `/holiday-programs`). No intake dates, fees or masterclass speakers are copied, because they change. Subject list taken from the Academy's programme categories. | Re-check the links if the Academy site changes its routes (unknown paths there show the homepage, so a broken link would not look broken). |


## Quotation builder: open business decisions

Prices, deliverables and availability are exactly the supplied list (portal migration 040, editable at portal `/admin/services/capture-films`). These points were not specified and use a cautious default:

| Item | Current default | To confirm |
| --- | --- | --- |
| Exchange rate (UGX per USD) | Not set. USD is shown as unavailable; UGX works. | An admin sets the rate on the price-list page. |
| Kampala service area boundary | Not defined. The customer chooses "within the Kampala service area" or "outside Kampala"; the page says the team confirms it. No location is checked automatically. | Define the area (districts or a radius) if customers should be told. |
| Upcountry transport and accommodation | Outside Kampala the customer chooses either "I will provide transport and accommodation" or "Please quote logistics separately". No logistics fee is ever added automatically; an admin enters any agreed logistics charge in the quotation review. | Confirm the wording and that no standard upcountry fee should be shown. |
| Which extras need photography or videography | Only the 4K upgrade and the 25/45-minute edits require videography (as supplied). Extra photo books, framed prints, extra photographers and extra videographers can be chosen with either service, or with only the other service (for example an extra videographer with photography only). | Say if any of these should require a service. This is a `requires` setting in the price list; the price-list page does not edit it yet, so it needs a new catalogue version (a small developer change, no code change to the builder). |
| 25- and 45-minute special edits | Added on top of standard videography (as supplied); both can be chosen together. | Confirm both may be chosen together. |
| Memory Lane, Love Story, Same-day edit / highlights | Shown by name only, with their prices. No description, duration or deliverable is stated. | Supply one-line descriptions if wanted. |
| Social media reels quantity | 1 to 50 reels per request (a form limit, not a price), Other event only. | Adjust the minimum and maximum on the price-list page if needed. |
| Who may change prices, the rate and discounts | Administrators only, enforced in the portal and again by the database functions. Staff can view quotations and the price list read-only. Finance users cannot open booking pages today. | Confirm, or allow Finance (needs a role change). |
| Legacy enquiry forms | Now validated by the portal: a malformed email or phone number, or a message over 5,000 characters, is refused with a message saying what to fix (previously accepted). Phone stays optional on these forms and required in the quotation builder. | None expected. |
| Price-list safety | The price-list page validates every change before publishing; the database function itself only checks the basic shape. An administrator bypassing the page could publish an invalid list, in which case the builder hides itself and the simple form is used. | None (administrators only). |

## Portfolio images

- Source of truth: `_review/portfolio.json`. Readable summary: `_review/ASSET_REVIEW.md` (generated).
- Only `approved` items are published. `pending` items appear only in `_review/preview/` (run `python build.py --preview`), each marked PENDING.
- Ownership is never inferred from a filename, watermark, EXIF data or folder. Record who approved an item and on what basis in `approved_by`.
- Workflow: edit the JSON → `python build_images.py` → `python build.py` → `python build.py --preview`.
- To view the preview, open `_review/preview/index.html` directly (double-click), or run `python preview.py` and open http://localhost:8000/ while it keeps running. The public build uses root-relative paths for Cloudflare Pages, so view it with `python preview.py --public`, not by opening its files.
- `build.py` refuses to build the public site if `assets/img/work/` holds a file that is not approved.
- Removed from public presentation in Oct 2026 (origin unverified): `portrait-hat.jpg`, `bts-spotlight.jpg`, `bts-studio.jpg`. Moved to `_review/held-for-permission/`.
