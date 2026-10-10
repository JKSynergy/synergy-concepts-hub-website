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

## Portfolio images

- Source of truth: `_review/portfolio.json`. Readable summary: `_review/ASSET_REVIEW.md` (generated).
- Only `approved` items are published. `pending` items appear only in `_review/preview/` (run `python build.py --preview`), each marked PENDING.
- Ownership is never inferred from a filename, watermark, EXIF data or folder. Record who approved an item and on what basis in `approved_by`.
- Workflow: edit the JSON → `python build_images.py` → `python build.py` → `python build.py --preview`.
- To view the preview, open `_review/preview/index.html` directly (double-click), or run `python preview.py` and open http://localhost:8000/ while it keeps running. The public build uses root-relative paths for Cloudflare Pages, so view it with `python preview.py --public`, not by opening its files.
- `build.py` refuses to build the public site if `assets/img/work/` holds a file that is not approved.
- Removed from public presentation in Oct 2026 (origin unverified): `portrait-hat.jpg`, `bts-spotlight.jpg`, `bts-studio.jpg`. Moved to `_review/held-for-permission/`.
