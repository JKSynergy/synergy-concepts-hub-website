# Synergy Concepts Hub: design direction

**Clean. Clear. Corporate. Purposeful.**  Complex work, simple experience.

## Principles
1. Typography, whitespace, a 12-column grid and hairline rules do the work. Cards are the exception.
2. Every section has one job. One idea per screen, in this order: Hero, Technology, Business Creative, Products, Work, SMA bridge, Contact.
3. Technology is shown as large typographic rows (01 to 04). Creative leans on real photography and design work. Products may use cards. Work is image-led.
4. One primary action everywhere: **Start a Project**.
5. Hybrid editorial/business language: more structured and corporate than SMA, more visual where creative work needs it. SMA keeps its own cardless, educational style.

## System (assets/css/sch.css, about 17 KB, replaces the 163 KB ecosystem.css)
- **Colour:** navy #0B0F19, white, warm stone #F4F3F0, logo orange #ED8C22 (buttons and marks on dark only), darker orange #B25B00 for small text on light, logo blue #1773B9 reserved. No gradients, glows, glass or blur.
- **Type:** Sora (headings) and Inter (body). Space Grotesk removed. One scale, tight tracking on display sizes.
- **Shape:** 2px corners, 1px rules, no shadows.
- **Rhythm:** sections alternate white, stone and navy only when the content changes character (navy for Hero, Work and Contact).
- **Motion:** colour and underline transitions only. No scroll animation, counters, parallax or tilt. Reduced-motion respected.
- **Components:** `.rows` (typographic list), `.row--img` (row with photo), `.svc` (service block), `.split` (image and text), `.steps`, `.cards` (products only), `.wgrid` (work), `.table`, `.field` (underlined form fields).
- **Portfolio (Oct 2026):** `.gal` (native-ratio gallery, 2/3/4 columns, never cropped; logos sit in square frames, contained), `.jrow`/`.ji` (homepage Selected Work: justified pairs at native proportions), `.gsec` (one gallery section per category, with its own enquiry link), `.jump` (in-page category links), `.duo` (two-column comparison), `.pend` (PENDING marker, review preview only). Full-size viewer: a plain `<dialog>` built by `sch.js`; keyboard arrows, Escape closes, focus returns to the image that opened it. Without JS, gallery links open the image file.

## Removed from the old design
Dashboard mock-ups and fake live data, glass cards (14 on the homepage), 25 pill badges, 138 gradients, 76 blur filters, 39 keyframe animations, animated counters, the "Ecosystem" section, the infrastructure map overlay, per-pillar colour coding, and Space Grotesk.

## Files
`build.py` generates every page (edit copy there, then run `python build.py`). Portfolio items come from `_review/portfolio.json`; run `python build_images.py` after editing it, and `python build.py --preview` for the review copy in `_review/preview/`. Pages live in folders (`/technology/`, `/creative/` and so on). `_redirects` sends the old social media management URL to `/creative/social-media-content/`.
