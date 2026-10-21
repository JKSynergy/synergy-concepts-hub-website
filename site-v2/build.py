#!/usr/bin/env python3
"""Builds the Synergy Concepts Hub static site (plain HTML, no framework).
Run:  python build.py             Output: HTML files next to this script (the public site).
      python build.py --preview   Output: _review/preview/ (local review copy that also shows
                                  PENDING portfolio items, clearly marked; never deployed).
                                  Open _review/preview/index.html directly (preview links are
                                  relative), or serve it with `python preview.py`.
Edit copy in this file; edit the look in assets/css/sch.css.
Portfolio items come from _review/portfolio.json. After editing it, run build_images.py first."""
import os, sys, html, json, shutil, datetime, subprocess, hashlib

SRC = os.path.dirname(os.path.abspath(__file__))
PREVIEW = "--preview" in sys.argv
ROOT = os.path.join(SRC, "_review", "preview") if PREVIEW else SRC
SITE = "https://synergyconceptshub.com"
SMA = "https://synergymultimediaacademy.com/"
PORTAL = "https://portal.synergyconceptshub.com"
EMAIL = "info@synergyconceptshub.com"
PHONE_DISPLAY = "+256 706 739 311"
PHONE_TEL = "+256706739311"
WHATSAPP = "https://wa.me/256706739311?text=Hello%20Synergy%20Concepts%20Hub"
IMG = "/assets/img/"

# ---- Business-content switches (see CONTENT_REVIEW.md) ----
# Flip to True only after the business has confirmed the item.
SHOW_SELECTED_CLIENTS = False        # homepage "Selected clients" line: client names approved for public display?
# Social package quantities and prices are no longer shown as a table: they are published only once the
# business confirms them (see CONTENT_REVIEW.md). Portfolio images are gated by _review/portfolio.json.

# ---- Portfolio (see _review/portfolio.json and _review/ASSET_REVIEW.md) ----
with open(os.path.join(SRC, "_review", "portfolio.json"), encoding="utf8") as _f:
    _MANIFEST = json.load(_f)
with open(os.path.join(SRC, "_review", "portfolio.images.json"), encoding="utf8") as _f:
    _SIZES = json.load(_f)

def _visible(it):
    if not it.get("proposed", True) or it["status"] == "rejected" or it["id"] not in _SIZES:
        return False
    if PREVIEW:
        return True
    if it["status"] == "approved" and _SIZES[it["id"]]["dir"] != "public":
        sys.exit(f"ABORT: {it['id']} is approved but its images are not prepared. Run build_images.py first.")
    return it["status"] == "approved"

ITEMS = [it for it in _MANIFEST["items"] if _visible(it)]

# Public-build gate: assets/img/work/ may hold only files that belong to approved items.
_approved_files = {v[0] for i, s in _SIZES.items() if s["dir"] == "public"
                   for v in s["files"].values()
                   if any(it["id"] == i and it["status"] == "approved" for it in _MANIFEST["items"])}
# Each approved JPEG may have its WebP copy (build_webp.py) beside it.
_approved_files |= {os.path.splitext(n)[0] + ".webp" for n in _approved_files}
_work_dir = os.path.join(SRC, "assets", "img", "work")
_stray = sorted(set(os.listdir(_work_dir)) - _approved_files) if os.path.isdir(_work_dir) else []
if _stray and not PREVIEW:
    sys.exit("ABORT: assets/img/work/ contains files that are not approved in portfolio.json "
             "(run build_images.py, then remove these by hand):\n  " + "\n  ".join(_stray))

def items(category=None, group=None):
    return [it for it in ITEMS if (category is None or it["category"] == category)
            and (group is None or it["group"] == group)]

# Five top-level links; Creative opens a small menu of its sub-pages. Academy lives in the footer.
NAV = [
    ("Technology", "/technology/", None),
    ("Creative", "/creative/", [
        ("Photography & Video", "/creative/photography/"),
        ("Graphic Design & Branding", "/creative/design/"),
        ("Social Media Content", "/creative/social-media-content/"),
    ]),
    ("Products", "/products/", None),
    ("Work", "/work/", None),
    ("About", "/about/", None),
]
# Pages that highlight a nav item other than their own URL
NAV_PARENT = {}

def esc(s): return html.escape(s, quote=True)

def header(current):
    links = ""
    for label, href, sub in NAV:
        if not sub:
            cur = ' aria-current="page"' if current == href else ""
            links += f'<li><a href="{href}"{cur}>{label}</a></li>'
            continue
        # parent is highlighted on its own page and on every sub-page
        in_section = current == href or any(current == h for _, h in sub)
        cur = ' aria-current="page"' if current == href else (' aria-current="true"' if in_section else "")
        items = ""
        for l, h in sub:
            sub_cur = ' aria-current="page"' if current == h else ""
            items += f'<li><a href="{h}"{sub_cur}>{esc(l)}</a></li>'
        links += (f'<li class="nav-drop"><a href="{href}"{cur}>{label}</a>'
                  f'<button class="nav-caret" type="button" aria-expanded="false" aria-controls="nav-sub-{label.lower()}" '
                  f'aria-label="{label} pages"><span aria-hidden="true">&#9662;</span></button>'
                  f'<ul class="nav-sub" id="nav-sub-{label.lower()}">{items}</ul></li>')
    actions = (
        f'<a class="nav-portal" href="{PORTAL}">Portal&nbsp;&#8594;</a>'
        '<a class="btn" href="/contact/">Start a Project</a>'
    )
    return f'''<a class="skip" href="#main">Skip to content</a>
<header class="site-header"><div class="hdr">
<a class="brand" href="/" aria-label="Synergy Concepts Hub, home"><img src="{IMG}logo-mark-light.png" alt="" width="30" height="30"><span>Synergy Concepts Hub</span></a>
<button class="menu-btn" aria-expanded="false" aria-controls="nav">Menu</button>
<nav class="nav" id="nav" aria-label="Main"><ul class="nav-links">{links}</ul><div class="nav-actions">{actions}</div></nav>
</div></header>'''

FOOTER = f'''<footer class="site-footer"><div class="wrap">
<div class="grid">
<div><a class="brand" href="/"><img src="{IMG}logo-mark-light.png" alt="" width="30" height="30"><span>Synergy Concepts Hub</span></a>
<p class="about">Technology and business creative company in Kampala, Uganda. The company behind Synergy Multimedia Academy.</p></div>
<div><p class="lbl">Technology</p><ul>
<li><a href="/technology/#business-systems">Business Systems</a></li>
<li><a href="/technology/#web-digital-platforms">Web &amp; Digital Platforms</a></li>
<li><a href="/technology/#ai-automation">AI &amp; Automation</a></li>
<li><a href="/technology/#managed-technology">Managed Technology</a></li></ul></div>
<div><p class="lbl">Creative</p><ul>
<li><a href="/creative/photography/">Photography &amp; Video</a></li>
<li><a href="/creative/design/">Graphic Design &amp; Branding</a></li>
<li><a href="/creative/social-media-content/">Social Media Content</a></li>
<li><a href="/creative/#campaign-content-production">Campaign &amp; Content Production</a></li></ul></div>
<div><p class="lbl">Company</p><ul>
<li><a href="/products/">Products</a></li>
<li><a href="/work/">Work</a></li>
<li><a href="/about/">About</a></li>
<li><a href="/contact/">Contact</a></li></ul></div>
<div><p class="lbl">Elsewhere</p><ul>
<li><a href="{SMA}" target="_blank" rel="noopener">Academy (SMA) &#8599;</a></li>
<li><a href="{PORTAL}">Portal</a></li>
<li><a href="https://www.linkedin.com/company/synergyconceptshub" target="_blank" rel="noopener">LinkedIn</a></li>
<li><a href="https://www.instagram.com/synergycapturefilms_weddings" target="_blank" rel="noopener">Instagram</a></li>
<li><a href="https://www.youtube.com/@synergycapturefilms_ug" target="_blank" rel="noopener">YouTube</a></li></ul></div>
</div>
<div class="base"><span>&copy; 2026 Synergy Concepts Hub. Kampala, Uganda.</span><a href="#top">Back to top &#8593;</a></div>
</div></footer>'''

import re as _re

# Cache-busting: the CSS/JS links carry a short hash of the file, so browsers fetch a new copy
# the moment it changes instead of reusing a cached one for hours.
def _asset_version(rel):
    with open(os.path.join(SRC, rel), "rb") as f:
        return hashlib.sha256(f.read().replace(b"\r\n", b"\n")).hexdigest()[:10]
ASSET_V = {"css": _asset_version("assets/css/sch.css"), "js": _asset_version("assets/js/sch.js")}

def _relativize(out, path):
    """Review preview only: rewrite root-relative URLs (/assets/..., /work/) as relative ones, so the
    preview also works when its HTML files are opened straight from disk (file://). The public build
    keeps root-relative URLs, exactly as served by Cloudflare Pages."""
    depth = len([p for p in path.strip("/").split("/") if p])
    pre = "../" * depth or "./"
    def fix(url):
        m = _re.match(r"/([^?#]*)([?#].*)?$", url)
        rest, tail = m.group(1), m.group(2) or ""
        if rest == "" or rest.endswith("/"):
            rest += "index.html"
        return pre + rest + tail
    out = _re.sub(r'((?:href|src)=")(/(?!/)[^"]*)"', lambda m: m.group(1) + fix(m.group(2)) + '"', out)
    out = _re.sub(r'(srcset=")([^"]*)"', lambda m: m.group(1) + _re.sub(r"(^|,\s*)/(?!/)", lambda n: n.group(1) + pre, m.group(2)) + '"', out)
    return out

def _webp_file(url):
    """The WebP copy of a site JPEG URL, if build_webp.py made one (public or review-preview images)."""
    if not url.startswith(IMG) or not url.lower().endswith((".jpg", ".jpeg")):
        return None
    rel = url[1:].rsplit(".", 1)[0] + ".webp"
    for base in (SRC, os.path.join(SRC, "_review", "preview")):
        if os.path.exists(os.path.join(base, rel)):
            return "/" + rel
    return None

def _webpify(out):
    """Serve WebP where a copy exists: wrap each JPEG <img> in <picture> with a WebP <source>
    (the JPEG stays as the fallback), and give full-size viewer links a data-webp URL.
    og:image / twitter:image stay JPEG for the social platforms."""
    def pic(m):
        tag = m.group(0)
        src = _re.search(r'\bsrc="([^"]+)"', tag)
        if not src or not _webp_file(src.group(1)):
            return tag
        srcset = _re.search(r'\bsrcset="([^"]+)"', tag)
        if srcset:
            parts = []
            for c in srcset.group(1).split(","):
                u, *d = c.strip().split()
                w = _webp_file(u)
                if not w:
                    return tag
                parts.append(" ".join([w] + d))
            ws = ", ".join(parts)
        else:
            ws = _webp_file(src.group(1))
        sizes = _re.search(r'\bsizes="([^"]+)"', tag)
        sz = f' sizes="{sizes.group(1)}"' if sizes else ""
        return f'<picture><source type="image/webp" srcset="{ws}"{sz}>{tag}</picture>'
    out = _re.sub(r'<img\b[^>]*>', pic, out)
    def link(m):
        w = _webp_file(m.group(2))
        return m.group(0) if not w or "data-webp=" in m.group(0) else f'{m.group(1)}{m.group(2)}" data-webp="{w}"'
    out = _re.sub(r'(<a\b(?=[^>]*\bdata-gallery=)[^>]*?\bhref=")([^"]+)"', link, out)
    return out

DEFAULT_OG_IMAGE = (f"{IMG}brand-stationery.jpg", 1400, 1400, "Synergy Concepts Hub stationery: notebook, letterhead, business card and mug")
PAGE_LASTMOD = {}

def og_from_item(item_id, fallback=DEFAULT_OG_IMAGE):
    if item_id and item_id in _SIZES and _SIZES[item_id].get("dir") == "public":
        files = _SIZES[item_id]["files"]
        chosen = files.get("1280") or files.get("full") or next(iter(files.values()))
        it = next((x for x in ITEMS if x["id"] == item_id), None)
        alt = it["alt"] if it and it.get("alt") else fallback[3]
        return (f"{IMG}work/{chosen[0]}", chosen[1], chosen[2], alt)
    return fallback

def _source_lastmod():
    """Return the latest Git commit date among the source files that determine public page content.

    Public pages are generated entirely from build.py and the portfolio metadata files,
    so their lastmod should reflect the most recent change to any of those inputs, not the
    build execution date. If Git history is unavailable, fall back to today and document it.
    """
    sources = [
        "build.py",
        "_review/portfolio.json",
        "_review/portfolio.images.json",
    ]
    dates = []
    for rel in sources:
        try:
            lg = subprocess.run(
                ["git", "log", "-1", "--format=%cs", "--", rel],
                cwd=SRC, capture_output=True, text=True, timeout=5, check=False
            )
            dt = lg.stdout.strip()
            if _re.match(r"^\d{4}-\d{2}-\d{2}$", dt):
                dates.append(dt)
        except Exception:
            pass
    if dates:
        return max(dates)
    # Deterministic fallback: build date. This is not a verified content-change date.
    return datetime.date.today().isoformat()

SOURCE_LASTMOD = _source_lastmod()

def json_ld(*entities):
    payload = {
        "@context": "https://schema.org",
        "@graph": [e for e in entities if e],
    }
    return f'<script type="application/ld+json">{json.dumps(payload, ensure_ascii=False, separators=(",", ":"))}</script>'

def breadcrumb_ld(*crumbs):
    return {
        "@type": "BreadcrumbList",
        "itemListElement": [
            {
                "@type": "ListItem",
                "position": idx + 1,
                "name": name,
                "item": f"{SITE}{href}",
            }
            for idx, (name, href) in enumerate(crumbs)
        ],
    }

def page(path, title, desc, body, current="", schema="", out_file=None, og_img=None):
    url = SITE + path
    og_path, og_w, og_h, og_alt = og_img or DEFAULT_OG_IMAGE
    og_url_full = f"{SITE}{og_path}"
    # out_file: write a single top-level file (used for 404.html) with noindex and no canonical
    canon = "" if out_file else f'<link rel="canonical" href="{url}">'
    robots = '<meta name="robots" content="noindex">' if (out_file or PREVIEW) else ""
    if PREVIEW:
        body = ('<div class="preview-bar" role="note">Review preview. Items marked '
                '<span class="pend">Pending</span> are not on the public site.</div>') + body
    out = f'''<!doctype html>
<html lang="en" id="top">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
{canon}{robots}
<meta property="og:locale" content="en_UG">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Synergy Concepts Hub">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
{"" if out_file else f'<meta property="og:url" content="{url}">'}
<meta property="og:image" content="{og_url_full}">
<meta property="og:image:width" content="{og_w}">
<meta property="og:image:height" content="{og_h}">
<meta property="og:image:alt" content="{esc(og_alt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc(title)}">
<meta name="twitter:description" content="{esc(desc)}">
<meta name="twitter:image" content="{og_url_full}">
<meta name="twitter:image:alt" content="{esc(og_alt)}">
<meta name="theme-color" content="#0B0F19">
<link rel="icon" type="image/png" href="{IMG}logo-mark-light.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Sora:wght@600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/sch.css?v={ASSET_V["css"]}">
{schema}
</head>
<body>
{header(current)}
<main id="main">
{body}
</main>
{FOOTER}
<script src="/assets/js/sch.js?v={ASSET_V["js"]}" defer></script>
</body>
</html>
'''
    out = _webpify(out)
    if PREVIEW:
        out = _relativize(out, "/" if out_file else path)
    if out_file:
        target = os.path.join(ROOT, out_file)
        if not (os.path.exists(target) and open(target, encoding="utf8").read() == out):
            with open(target, "w", encoding="utf8", newline="\n") as f:
                f.write(out)
        return
    d = os.path.join(ROOT, path.strip("/"))
    os.makedirs(d, exist_ok=True)
    target = os.path.join(d, "index.html")
    if not (os.path.exists(target) and open(target, encoding="utf8").read() == out):
        with open(target, "w", encoding="utf8", newline="\n") as f:
            f.write(out)
    if not PREVIEW:
        PAGE_LASTMOD[path] = SOURCE_LASTMOD

# ---------- shared blocks ----------
def sec_head(num, label, h2, lede=""):
    p = f'<p class="lede">{lede}</p>' if lede else ""
    return f'''<div class="sec-head"><p class="eyebrow"><b>{num}</b>{label}</p><div class="title"><h2>{h2}</h2>{p}</div></div>'''

def rows(items):
    out = '<div class="rows">'
    for n, t, d, href in items:
        out += f'<a class="row" href="{href}"><span class="n">{n}</span><span class="t">{t}</span><span class="d">{d}</span><span class="a" aria-hidden="true">&rarr;</span></a>'
    return out + "</div>"

def img_rows(items):
    """Rows with a picture. `pic` is a portfolio item dict, or None for a plain row."""
    out = '<div class="rows">'
    for n, t, d, href, pic in items:
        if pic:
            out += f'''<a class="row row--img" href="{href}"><span class="n">{n}</span><span class="txt"><span class="t">{t}</span><span class="d">{d}</span></span><span class="pic">{img_tag(pic, "(max-width: 900px) 100vw, 40vw")}{pend(pic)}</span></a>'''
        else:
            out += f'<a class="row row--img row--noimg" href="{href}"><span class="n">{n}</span><span class="txt"><span class="t">{t}</span><span class="d">{d}</span></span><span class="a" aria-hidden="true">&rarr;</span></a>'
    return out + "</div>"

# ---------- portfolio images ----------
WORK = IMG + "work/"

def pend(it):
    return '<span class="pend">Pending</span>' if it["status"] != "approved" else ""

def img_tag(it, sizes, eager=False):
    s = _SIZES[it["id"]]["files"]
    widths = sorted((v for k, v in s.items() if k != "full"), key=lambda v: v[1])
    small = widths[0]
    srcset = ", ".join(f"{WORK}{n} {w}w" for n, w, h in widths)
    load = 'loading="eager" fetchpriority="high"' if eager else 'loading="lazy"'
    return (f'<img src="{WORK}{small[0]}" srcset="{srcset}" sizes="{sizes}" width="{small[1]}" height="{small[2]}" '
            f'alt="{esc(it["alt"])}" {load} decoding="async">')

def caption(it):
    who = esc(it["client"]) if it.get("client") and "own brand" not in it["client"].lower() else ""
    return f'<b>{esc(it["caption"])}</b>' + (f'<span>{who}</span>' if who else "")

def figure(it, gallery, sizes, extra_cap="", siblings=()):
    """A gallery figure. The link opens the full-size image (the viewer in sch.js enhances it).
    `siblings` = further pages of a set: hidden links that join the same viewer sequence."""
    full = _SIZES[it["id"]]["files"]["full"]
    cap_txt = it["caption"] + (f" — {it['client']}" if it.get("client") else "")
    out = (f'<figure class="gi" style="--ar:{full[1] / full[2]:.4f}">'
           f'<a href="{WORK}{full[0]}" data-gallery="{gallery}" data-caption="{esc(cap_txt)}" '
           f'data-w="{full[1]}" data-h="{full[2]}" aria-label="View larger: {esc(it["alt"])}">'
           f'{img_tag(it, sizes)}</a>{pend(it)}'
           f'<figcaption>{caption(it)}{extra_cap}</figcaption>')
    for sib in siblings:
        f2 = _SIZES[sib["id"]]["files"]["full"]
        c2 = sib["caption"] + (f" — {sib['client']}" if sib.get("client") else "")
        if sib["status"] != "approved":
            c2 += " (pending)"
        out += (f'<a hidden href="{WORK}{f2[0]}" data-gallery="{gallery}" data-caption="{esc(c2)}" '
                f'data-w="{f2[1]}" data-h="{f2[2]}" data-alt="{esc(sib["alt"])}"></a>')
    return out + "</figure>"

GAL_SIZES = {
    "c2": "(max-width: 560px) 100vw, (max-width: 900px) 50vw, 600px",
    "c3": "(max-width: 560px) 50vw, (max-width: 900px) 50vw, 400px",
    "c4": "(max-width: 560px) 50vw, (max-width: 900px) 33vw, 300px",
}

def gallery(its, cols="c3", name="g"):
    """Native-ratio gallery. Items that share a 'set' collapse to one figure (the first page) whose
    viewer sequence walks through every page of the set."""
    # Balance: when every visible tile shares one shape (all square logos, all 2:3 portraits), a plain grid
    # gives identical tiles in every row. Mixed shapes use equal-height rows instead. Nothing is cropped.
    rows_cls = ""
    if cols == "c3":
        tiles = []
        for it in its:
            if it.get("set") and any(t.get("set") == it["set"] for t in tiles):
                continue
            tiles.append(it)
        ars = [_SIZES[t["id"]]["files"]["full"][1] / _SIZES[t["id"]]["files"]["full"][2] for t in tiles]
        if ars and max(ars) / min(ars) > 1.10:
            rows_cls = " gal--rows"
        elif ars:  # near-identical shapes: one shared tile shape (trims at most a few percent at the edges)
            tile = sorted(ars)[len(ars) // 2]
            if len(tiles) % 3 and len(tiles) % 4 == 0:
                cols = "c4"   # e.g. 4 tiles: one full row of four instead of three plus one
            rows_cls = f'" style="--tile:{tile:.4f}'
    out, seen = f'<div class="gal gal--{cols}{rows_cls}">', set()
    for it in its:
        st = it.get("set")
        if st:
            if st in seen:
                continue
            seen.add(st)
            pages = [x for x in ITEMS if x.get("set") == st]
            extra = f'<span>{len(pages)} pages</span>' if len(pages) > 1 else ""
            case = case_for_set(st)
            if case:
                extra += f'<a class="link case-link" href="/work/{case["slug"]}/">Case study &rarr;</a>'
            out += figure(pages[0], f"{name}-{st}", GAL_SIZES[cols], extra, pages[1:])
        else:
            out += figure(it, name, GAL_SIZES[cols])
    return out + "</div>"

# Case studies are published only when the case and every page of its set are approved
# (the preview shows pending cases, marked).
def case_for_set(st):
    for c in _MANIFEST.get("cases", []):
        if c["set"] == st and (PREVIEW or c["status"] == "approved"):
            pages = [x for x in _MANIFEST["items"] if x.get("set") == st]
            if PREVIEW or all(p["status"] == "approved" for p in pages):
                return c
    return None

def contact_block(sec_cls="dark"):
    return f'''<section class="sec {sec_cls}" id="contact"><div class="wrap">
{sec_head("", "Contact", "Start a project.", "Tell us what you need. A short description is enough. We reply within 24 hours.")}
<div class="contact">
<div class="info"><dl>
<div><dt>Email</dt><dd><a href="mailto:{EMAIL}">{EMAIL}</a></dd></div>
<div><dt>Phone and WhatsApp</dt><dd><a href="tel:{PHONE_TEL}">{PHONE_DISPLAY}</a> &middot; <a href="{WHATSAPP}" target="_blank" rel="noopener">WhatsApp</a></dd></div>
<div><dt>Location</dt><dd>Kampala, Uganda</dd></div>
</dl>
<p class="small">Looking for courses or training? Visit <a class="link" href="{SMA}" target="_blank" rel="noopener">Synergy Multimedia Academy &#8599;</a></p></div>
<div class="form">{form_html()}</div>
</div></div></section>'''

def form_html():
    return '''<form id="enquiry" novalidate>
<div class="two">
<div class="field"><label for="f-name">Name</label><input id="f-name" name="name" type="text" required autocomplete="name"></div>
<div class="field"><label for="f-email">Email</label><input id="f-email" name="email" type="email" required autocomplete="email"></div>
</div>
<div class="two">
<div class="field"><label for="f-phone">Phone or WhatsApp (optional)</label><input id="f-phone" name="phone" type="tel" autocomplete="tel"></div>
<div class="field"><label for="f-service">What do you need?</label><select id="f-service" name="service" required>
<option value="">Select</option>
<optgroup label="Creative">
<option value="photography">Photography &amp; Video</option>
<option value="design">Graphic Design &amp; Branding</option>
<option value="social">Social Media Content</option>
<option value="social-management">Social Media Management</option>
<option value="campaign">Campaign &amp; Content Production</option>
<option value="creative">Other creative work</option>
</optgroup>
<optgroup label="Technology">
<option value="technology">Systems, websites or automation</option>
</optgroup>
<option value="products">Products</option><option value="other">Other</option></select></div>
</div>
<div class="field"><label for="f-brief">About your project</label><textarea id="f-brief" name="brief" required></textarea></div>
<div class="form-foot"><button class="btn" type="submit">Send enquiry</button><p id="formStatus" role="status"></p></div>
</form>'''

def cta_band(text="Have a project in mind?", label="Start a Project", href="/contact/"):
    return f'''<section class="sec dark sec--tight"><div class="wrap"><div class="actions" style="justify-content:space-between">
<h2 style="max-width:22ch">{text}</h2><a class="btn" href="{href}">{label}</a></div></div></section>'''

# Enquiry links: each opens the contact form with the right service pre-selected.
CTA = {
    "photography": ("Book a photography session", "/contact/?service=photography"),
    "design": ("Request a design quote", "/contact/?service=design"),
    "social": ("Get a content quote", "/contact/?service=social"),
    "social-management": ("Ask about account management", "/contact/?service=social-management"),
    "campaign": ("Plan a campaign", "/contact/?service=campaign"),
}

def cta_link(key):
    label, href = CTA[key]
    return f'<a class="link" href="{href}">{label} &rarr;</a>'

def plain(lst):
    return '<ul class="plain-list">' + "".join(f"<li>{i}</li>" for i in lst) + "</ul>"

# ---------- STRUCTURED DATA ----------
ORG_ID = f"{SITE}/#organization"
ORG_REF = {"@id": ORG_ID}
ORG_ENTITY = {
    "@type": ["Organization", "ProfessionalService"],
    "@id": ORG_ID,
    "name": "Synergy Concepts Hub",
    "url": f"{SITE}/",
    "logo": {
        "@type": "ImageObject",
        "url": f"{SITE}{IMG}logo-mark-light.png",
        "width": 250,
        "height": 256,
    },
    "image": f"{SITE}{IMG}brand-stationery.jpg",
    "description": "Technology and business creative company in Kampala, Uganda: photography and video, graphic design and branding, social media content, business systems, websites, AI and automation, and managed technology.",
    "email": EMAIL,
    "telephone": PHONE_TEL,
    "address": {
        "@type": "PostalAddress",
        "addressLocality": "Kampala",
        "addressCountry": "UG",
    },
    "areaServed": {
        "@type": "Country",
        "name": "Uganda",
    },
    "department": [
        {
            "@type": "Organization",
            "name": "Synergy Capture Films",
            "url": f"{SITE}/creative/photography/",
            "description": "Photography and video production side of Synergy Concepts Hub in Kampala, Uganda.",
        },
        {
            "@type": "Organization",
            "name": "Synergy Creative Hub",
            "url": f"{SITE}/creative/design/",
            "description": "Graphic design, brand identity and company profile design side of Synergy Concepts Hub in Kampala, Uganda.",
        },
    ],
    "subOrganization": {
        "@type": "EducationalOrganization",
        "name": "Synergy Multimedia Academy",
        "url": SMA,
        "description": "Education brand by Synergy Concepts Hub offering creative and digital media courses.",
    },
    "sameAs": [
        "https://www.linkedin.com/company/synergyconceptshub",
        "https://www.instagram.com/synergycapturefilms_weddings",
        "https://www.youtube.com/@synergycapturefilms_ug",
        SMA,
    ],
}
WEBSITE_ENTITY = {
    "@type": "WebSite",
    "@id": f"{SITE}/#website",
    "url": f"{SITE}/",
    "name": "Synergy Concepts Hub",
    "publisher": ORG_REF,
    "inLanguage": "en",
}
HOME_LD = json_ld(ORG_ENTITY, WEBSITE_ENTITY)

TECH = [
    ("01", "Business Systems", "Software for lending, bookings, customer records and daily operations, built around how your business works.", "/technology/#business-systems"),
    ("02", "Web &amp; Digital Platforms", "Websites and online platforms your customers can use, from company sites to booking systems.", "/technology/#web-digital-platforms"),
    ("03", "AI &amp; Automation", "Automation that removes repetitive work, and AI where it genuinely helps.", "/technology/#ai-automation"),
    ("04", "Managed Technology", "Hosting, backups, maintenance and support, so your systems keep running.", "/technology/#managed-technology"),
]
def first(category, group=None):
    its = items(category, group)
    return its[0] if its else None

CREATIVE = [
    ("01", "Photography &amp; Video", "Portraits, studio sessions, product and brand photography, and business video. By Synergy Capture Films.", "/creative/photography/", first("photography", "product") or first("photography")),
    ("02", "Graphic Design &amp; Branding", "Logos and identity, company profiles, presentations and promotional design. By Synergy Creative Hub.", "/creative/design/", first("design", "profiles") or first("design")),
    ("03", "Social Media Content", "Photos, short-form video and graphics for your channels, planned and produced each month.", "/creative/social-media-content/", first("design", "social")),
    ("04", "Campaign &amp; Content Production", "Content for launches, promotions and corporate communication.", "/creative/#campaign-content-production", None),
]

CLIENTS_STRIP = '''<div class="clients"><div class="wrap"><span class="label">Selected clients</span><span>QuickCredit</span><span>Afrisites</span><span>Octagon Africa</span><span>Elgon Bottling</span><span>Ecotrust</span><span>Diani Art Gallery</span></div></div>''' if SHOW_SELECTED_CLIENTS else '<!-- Selected clients line hidden until client names are approved for public display (SHOW_SELECTED_CLIENTS in build.py) -->'

# Selected work: items flagged "home" in portfolio.json (approved only, even in the preview),
# shown in justified pairs at their native proportions, then one technology project.
CAT_PAGE = {"photography": "/creative/photography/", "design": "/creative/design/"}
CAT_LABEL = {"photography": "Photography", "design": "Design"}

def selected_work():
    picks = sorted((it for it in ITEMS if it.get("home") and it["status"] == "approved"), key=lambda it: it["home"])[:4]
    out = ""
    for i in range(0, len(picks), 2):
        out += '<div class="jrow">'
        for it in picks[i:i + 2]:
            s = _SIZES[it["id"]]["files"]["full"]
            out += (f'<figure class="ji" style="--ar:{s[1] / s[2]:.4f}"><a href="{CAT_PAGE[it["category"]]}">'
                    f'{img_tag(it, "(max-width: 560px) 100vw, 50vw", eager=(i == 0))}</a>'
                    f'<figcaption><b>{esc(it["caption"])}</b><span>{CAT_LABEL[it["category"]]}</span></figcaption></figure>')
        out += "</div>"
    return out

home = f'''
<section class="hero"><div class="wrap">
<p class="eyebrow">Synergy Concepts Hub &middot; Kampala, Uganda</p>
<h1>Business software, websites, photography and design.</h1>
<p class="lede">We photograph, design and produce content for businesses, and build the systems, websites and automation they run on.</p>
<div class="actions"><a class="btn" href="/contact/">Start a Project</a><a class="link" href="/work/">See our work &rarr;</a></div>
</div></section>
{CLIENTS_STRIP}

<section class="sec sec--work" id="work"><div class="wrap">
<div class="sel-head"><p class="eyebrow">Selected work</p>
<p class="sel-links"><a class="link" href="/creative/photography/">Photography &rarr;</a><a class="link" href="/creative/design/">Design &rarr;</a><a class="link" href="/work/">All work &rarr;</a></p></div>
{selected_work()}
<div class="rows" style="margin-top:48px">
<a class="row row--kind" href="/work/#technology"><span class="n">Business system</span><span class="t">QuickCredit</span><span class="d">Lending platform with mobile money, credit scoring and live analytics.</span><span class="a" aria-hidden="true">&rarr;</span></a>
</div>
</div></section>

<section class="sec stone" id="creative"><div class="wrap">
{sec_head("01", "Creative", "Photography, design and content that make a business look as established as it is.")}
{img_rows(CREATIVE)}
</div></section>

<section class="sec" id="technology"><div class="wrap">
{sec_head("02", "Technology", "Systems, platforms and automation, built properly and looked after.")}
{rows(TECH)}
</div></section>

<section class="sec stone sec--tight" id="products"><div class="wrap">
{sec_head("03", "Products", "We also build our own software.")}
<div class="rows rows--sm">
<a class="row row--kind" href="/products/#quickcredit"><span class="n">In use</span><span class="t">QuickCredit</span><span class="d">Enterprise lending platform with mobile money integration, credit scoring and real-time analytics.</span><span class="a" aria-hidden="true">&rarr;</span></a>
<a class="row row--kind" href="/products/#sma-sync"><span class="n">In use</span><span class="t">SMA Sync</span><span class="d">Offline-first media synchronization software for creative production workflows. Built by Synergy. Used by SMA.</span><span class="a" aria-hidden="true">&rarr;</span></a>
<a class="row row--kind" href="/products/"><span class="n">Coming soon</span><span class="t">Creative and media recovery tools</span><span class="d">Tools for creative production, and for recovering and organizing photo and video files.</span><span class="a" aria-hidden="true">&rarr;</span></a>
</div>
</div></section>

<section class="sec" id="academy"><div class="wrap"><div class="split">
<div class="pic"><img src="{IMG}sma-learning.jpg" alt="A student editing photos on a laptop at Synergy Multimedia Academy" loading="lazy" width="1400" height="933"></div>
<div class="txt"><p class="eyebrow">Synergy Multimedia Academy</p><h2>Looking to learn creative and digital skills?</h2>
<p class="prose">Synergy Multimedia Academy is our education brand: courses, holiday programs and creative learning for the next generation of creators.</p>
<a class="link" href="{SMA}" target="_blank" rel="noopener">Visit the Academy &#8599;</a></div>
</div></div></section>

{contact_block()}
'''
page("/", "Synergy Concepts Hub | Software, Design & Photography in Uganda",
     "Synergy Concepts Hub builds custom business software, websites and automation, and produces commercial photography and graphic design in Kampala, Uganda.",
     home, schema=HOME_LD)

# ---------- TECHNOLOGY ----------
def svc(id_, n, title, intro, deliver, suited, work=""):
    w = f'<div><h3 class="lbl">Related work</h3>{work}</div>' if work else ""
    return f'''<article class="svc" id="{id_}"><div class="head"><span class="n">{n}</span><h2>{title}</h2></div>
<div class="body"><p class="lede">{intro}</p>
<div class="cols"><div><h3 class="lbl">What we deliver</h3>{plain(deliver)}</div><div><h3 class="lbl">Suited to</h3><p class="prose">{suited}</p>{"<div style='margin-top:28px'>"+w+"</div>" if w else ""}</div></div></div></article>'''

tech_body = f'''
<section class="page-head"><div class="wrap"><p class="eyebrow">Technology</p>
<h1>Custom business software, websites and systems in Uganda.</h1>
<p class="lede">We design, build and run the software your business depends on. One team, from first conversation to ongoing support.</p></div></section>
<section class="sec"><div class="wrap">
{svc("business-systems","01","Business Systems","Software that follows the way your business already works: lending, bookings, customer records, approvals and reporting.",
 ["Custom business software and internal tools","Client and customer portals","CRM, pipelines and dashboards","Payments and mobile money integration","Reporting and analytics"],
 "Businesses replacing spreadsheets, paper processes or disconnected tools.",
 '<p class="prose"><a class="link" href="/work/#technology">QuickCredit, Solverscreations, Elgon Bottling &rarr;</a></p>')}
{svc("web-digital-platforms","02","Web &amp; Digital Platforms","Websites and platforms your customers can use, from a corporate site to a full booking or e-commerce platform.",
 ["Business and corporate websites","Booking and reservation platforms","Web applications and portals","Content management your team can use","Fast, search-ready structure"],
 "Organisations that need a credible online presence, or want to take bookings and payments online.",
 '<p class="prose"><a class="link" href="/work/#websites">Afrisites, Octagon Africa, Diani Art Gallery &rarr;</a></p>')}
{svc("ai-automation","03","AI &amp; Automation","Automation that removes repeat work, and AI where it genuinely helps.",
 ["Workflow automation across forms, email, spreadsheets and systems","Approval, invoice and notification flows","Integrations between the tools you already use","Reports that update themselves","AI assistants for internal or customer tasks"],
 "Teams spending hours on manual, repeated tasks that follow clear rules.")}
{svc("managed-technology","04","Managed Technology","We keep what we build running, backed up and supported, under one name and one point of contact.",
 ["Managed hosting","Database hosting","Infrastructure management","System maintenance and updates","Backups and recovery","Deployment and operational support","Technical support"],
 "Businesses that want their systems looked after, without hiring an in-house technical team.")}
</div></section>
<section class="sec stone"><div class="wrap">
{sec_head("", "How we work", "Understand, build, support.")}
<ol class="steps">
<li><h3>Understand</h3><p>We start by understanding the business, the problem and what needs to change.</p></li>
<li><h3>Build</h3><p>We design and build practical technology and creative solutions around that need.</p></li>
<li><h3>Support</h3><p>We stay involved where ongoing maintenance, infrastructure or creative support is required.</p></li>
</ol></div></section>
{cta_band("Tell us what you need to build.")}
'''
TECH_LD = json_ld(
    breadcrumb_ld(("Home", "/"), ("Technology", "/technology/")),
    {
        "@type": "Service",
        "@id": f"{SITE}/technology/#service",
        "name": "Custom Business Software, Websites, AI Automation and Managed Hosting",
        "url": f"{SITE}/technology/",
        "provider": ORG_REF,
        "areaServed": {"@type": "Country", "name": "Uganda"},
        "serviceType": [
            "Custom Business Software & Internal Tools",
            "Business & Corporate Websites",
            "Workflow & AI Automation",
            "Managed Hosting & Infrastructure Support",
        ],
    },
)
page("/technology/", "Custom Software, Websites & Business Systems in Kampala, Uganda",
     "Custom business software, corporate websites, workflow automation and managed hosting built and supported by Synergy Concepts Hub in Kampala, Uganda.",
     tech_body, "/technology/", schema=TECH_LD)

# ---------- CREATIVE ----------
PHOTO_GROUPS = [  # key, title, description, gallery columns
    ("portraits", "Portraits &amp; headshots", "Professional portraits for company profiles, websites and personal branding.", "c3"),
    ("studio", "Studio sessions", "Personal, couple and graduation portraits, photographed in the studio.", "c3"),
    ("product", "Product &amp; brand", "Products, and the people using them, photographed for brand and social media use.", "c3"),
    ("weddings", "Weddings &amp; ceremonies", "Weddings, introductions and other ceremonies.", "c3"),
]
DESIGN_GROUPS = [
    ("logos", "Logos &amp; brand identity", "Logos for businesses and organisations, shown flat, as delivered.", "c4"),
    ("profiles", "Company profiles &amp; documents", "Company profiles and presentation slides. Open a profile to read it page by page.", "c2"),
    ("social", "Social &amp; promotional design", "Flyers and social media graphics for products, services and launches.", "c3"),
    ("stationery", "Stationery &amp; collateral", "Stationery and printed collateral.", "c3"),
]

def gallery_sections(category, groups, cta_key):
    """One section per group that has items. Empty groups are left out entirely."""
    out, nav = "", []
    for key, title, desc, cols in groups:
        its = items(category, key)
        if not its:
            continue
        nav.append(f'<a href="#{key}">{title}</a>')
        out += f'''<section class="gsec" id="{key}" aria-labelledby="h-{key}"><div class="gsec-head">
<h2 id="h-{key}" class="h3">{title}</h2><p class="small">{desc}</p></div>
{gallery(its, cols, key)}
<p class="gsec-cta">{cta_link(cta_key)}</p></section>'''
    jump = f'<nav class="jump" aria-label="Categories on this page">{"".join(nav)}</nav>' if len(nav) > 1 else ""
    return jump, out

def svc_pics(its, href):
    if not its:
        return ""
    return '<div class="imgs imgs--native">' + "".join(
        f'<a href="{href}" class="pic">{img_tag(it, "(max-width: 560px) 100vw, 30vw")}{pend(it)}</a>' for it in its[:2]) + "</div>"

def creative_svc(id_, n, title, brand, intro, deliver, suited, pics, links):
    b = f'<p class="eyebrow">{brand}</p>' if brand else ""
    return f'''<article class="svc" id="{id_}"><div class="head"><span class="n">{n}</span><h2>{title}</h2>{b}</div>
<div class="body"><p class="lede">{intro}</p>
<div class="cols"><div><h3 class="lbl">What we deliver</h3>{plain(deliver)}</div><div><h3 class="lbl">Suited to</h3><p class="prose">{suited}</p>
<p class="svc-links">{links}</p></div></div>
{pics}</div></article>'''

client_design = [it for it in items("design") if "own brand" not in (it.get("client") or "").lower()]

creative_body = f'''
<section class="page-head"><div class="wrap"><p class="eyebrow">Creative</p>
<h1>Commercial photography, graphic design and campaign production.</h1>
<p class="lede">Photography and video by Synergy Capture Films, design and branding by Synergy Creative Hub, and content produced for social media and campaigns.</p>
<nav class="jump" aria-label="Creative services"><a href="#photography-video">Photography &amp; Video</a><a href="#graphic-design">Graphic Design &amp; Branding</a><a href="#social-media-content">Social Media Content</a><a href="#campaign-content-production">Campaign &amp; Content Production</a></nav></div></section>
<section class="sec"><div class="wrap">
{creative_svc("photography-video", "01", "Photography &amp; Video", "Synergy Capture Films",
  "Portraits, studio sessions and product photography, and video for business and promotion.",
  ["Portraits and professional headshots", "Studio sessions, including graduation and couple portraits", "Product and brand photography", "Weddings and ceremonies", "Business and promotional video"],
  "Professionals and teams who need current portraits, brands that need product images, and people marking a milestone.",
  svc_pics(items("photography"), "/creative/photography/"),
  '<a class="link" href="/creative/photography/">See photography work &rarr;</a>' + cta_link("photography"))}
{creative_svc("graphic-design", "02", "Graphic Design &amp; Branding", "Synergy Creative Hub",
  "Branding and materials that make a business look established and consistent.",
  ["Logos and brand identity", "Company profiles and presentations", "Marketing materials and flyers", "Corporate communication and reports", "Social media graphics"],
  "Businesses launching or refreshing a brand, and teams that need documents and promotional material to match it.",
  svc_pics(client_design, "/creative/design/"),
  '<a class="link" href="/creative/design/">See design work &rarr;</a>' + cta_link("design"))}
{creative_svc("social-media-content", "03", "Social Media Content", "",
  "Business photography, video and short-form content for the platforms your customers use, produced in one session a month.",
  ["Business photography", "Business video", "Short-form content for Reels, Shorts and TikTok", "Product and content shoots", "Visual content sized for each platform"],
  "Businesses that want a steady supply of their own photos and videos rather than stock images. Account management is a separate service.",
  svc_pics(items("design", "social"), "/creative/social-media-content/"),
  '<a class="link" href="/creative/social-media-content/">How it works &rarr;</a>' + cta_link("social"))}
{creative_svc("campaign-content-production", "04", "Campaign &amp; Content Production", "",
  "Content for launches, promotions and corporate communication, planned and produced as one piece of work.",
  ["Campaign photography and video", "Product launch content", "Corporate communication and internal video", "Promotional films", "Behind-the-scenes and highlights"],
  "Launches, promotions and announcements that need photography, video and design produced together.",
  "", cta_link("campaign"))}
</div></section>
{cta_band("Need design or content for your business?")}
'''
CREATIVE_LD = json_ld(
    breadcrumb_ld(("Home", "/"), ("Creative", "/creative/")),
    {
        "@type": "Service",
        "@id": f"{SITE}/creative/#service",
        "name": "Business Creative, Commercial Photography, Graphic Design and Campaign Production",
        "url": f"{SITE}/creative/",
        "provider": ORG_REF,
        "areaServed": {"@type": "City", "name": "Kampala"},
        "serviceType": [
            "Commercial Photography & Video Production",
            "Graphic Design & Brand Identity",
            "Social Media Content Production",
            "Campaign & Content Production",
        ],
    },
)
page("/creative/", "Business Creative, Video & Campaign Production | Kampala, Uganda",
     "Commercial photography, video production, graphic design, brand identity and campaign content for businesses in Kampala by Synergy Concepts Hub.",
     creative_body, "/creative/", schema=CREATIVE_LD)

# ---------- PHOTOGRAPHY ----------
_jump, _secs = gallery_sections("photography", PHOTO_GROUPS, "photography")
photo_body = f'''
<section class="page-head"><div class="wrap"><p class="eyebrow"><a href="/creative/" style="text-decoration:none">Creative</a> &nbsp;/&nbsp; Photography &amp; Video &middot; Synergy Capture Films</p>
<h1>Portrait, studio and product photography in Kampala.</h1>
<p class="lede">Portraits, studio sessions and product photography by Synergy Capture Films, the photography and video side of Synergy Concepts Hub. Select any image to see it larger.</p>
<div class="actions" style="margin-top:36px"><a class="btn" href="{CTA["photography"][1]}">{CTA["photography"][0]}</a></div>{_jump}</div></section>
<section class="sec"><div class="wrap">{_secs}</div></section>
{cta_band("Planning a shoot?", CTA["photography"][0], CTA["photography"][1])}
'''
PHOTO_LD = json_ld(
    breadcrumb_ld(("Home", "/"), ("Creative", "/creative/"), ("Photography & Video", "/creative/photography/")),
    {
        "@type": "Service",
        "@id": f"{SITE}/creative/photography/#service",
        "name": "Commercial, Portrait, Studio and Product Photography in Kampala",
        "url": f"{SITE}/creative/photography/",
        "provider": {
            "@type": "Organization",
            "name": "Synergy Capture Films",
            "parentOrganization": ORG_REF,
        },
        "areaServed": {"@type": "City", "name": "Kampala"},
        "serviceType": [
            "Corporate Headshots & Portraits",
            "Studio Photography Sessions",
            "Product & Brand Photography",
            "Wedding & Ceremony Photography",
            "Business & Promotional Video",
        ],
    },
)
page("/creative/photography/", "Commercial, Portrait & Studio Photography in Kampala | Synergy",
     "Corporate headshots, studio portraits, product photography, weddings and business video in Kampala by Synergy Capture Films (Synergy Concepts Hub).",
     photo_body, "/creative/photography/", schema=PHOTO_LD, og_img=og_from_item("christine-10"))

# ---------- DESIGN ----------
_jump, _secs = gallery_sections("design", DESIGN_GROUPS, "design")
design_body = f'''
<section class="page-head"><div class="wrap"><p class="eyebrow"><a href="/creative/" style="text-decoration:none">Creative</a> &nbsp;/&nbsp; Graphic Design &amp; Branding &middot; Synergy Creative Hub</p>
<h1>Graphic design, brand identity and company profiles.</h1>
<p class="lede">Logos, company profiles and promotional design by Synergy Creative Hub. Work for clients is credited to the client; Synergy&rsquo;s own brands are labelled as such. Select any design to see it larger.</p>
<div class="actions" style="margin-top:36px"><a class="btn" href="{CTA["design"][1]}">{CTA["design"][0]}</a></div>{_jump}</div></section>
<section class="sec"><div class="wrap">{_secs}</div></section>
{cta_band("Need a brand or a document designed?", CTA["design"][0], CTA["design"][1])}
'''
DESIGN_LD = json_ld(
    breadcrumb_ld(("Home", "/"), ("Creative", "/creative/"), ("Graphic Design & Branding", "/creative/design/")),
    {
        "@type": "Service",
        "@id": f"{SITE}/creative/design/#service",
        "name": "Graphic Design, Logo Design, Brand Identity and Company Profiles in Kampala",
        "url": f"{SITE}/creative/design/",
        "provider": {
            "@type": "Organization",
            "name": "Synergy Creative Hub",
            "parentOrganization": ORG_REF,
        },
        "areaServed": {"@type": "City", "name": "Kampala"},
        "serviceType": [
            "Logo Design & Brand Identity",
            "Company Profiles & Presentation Design",
            "Social Media & Promotional Graphics",
            "Corporate Stationery & Collateral",
        ],
    },
)
page("/creative/design/", "Graphic Design and Branding in Kampala | Synergy Creative Hub",
     "Logo design, brand identity, company profiles, presentations and promotional design in Kampala by Synergy Creative Hub, part of Synergy Concepts Hub.",
     design_body, "/creative/design/", schema=DESIGN_LD, og_img=og_from_item("matsen-01"))

# ---------- SOCIAL MEDIA CONTENT ----------
_social = items("design", "social")
_social_examples = f'''<section class="sec stone" id="examples"><div class="wrap">
{sec_head("", "Examples", "Graphics made for social media.")}
{gallery(_social, "c3", "social")}
</div></section>''' if _social else ""
_split_pic = first("photography", "product")
sm_body = f'''
<section class="page-head"><div class="wrap"><p class="eyebrow"><a href="/creative/" style="text-decoration:none">Creative</a> &nbsp;/&nbsp; Social Media Content</p>
<h1>Monthly social media content production for businesses.</h1>
<p class="lede">We plan, shoot and edit the photos, videos and graphics your business needs for social media in one monthly recording session. You post them when it suits you.</p>
<div class="actions" style="margin-top:36px"><a class="btn" href="{CTA["social"][1]}">{CTA["social"][0]}</a></div></div></section>
<section class="sec"><div class="wrap">
{sec_head("", "How it works", "Plan, record, deliver.")}
<ol class="steps">
<li><h3>Plan</h3><p>We agree a monthly content plan around your offers, products and calendar.</p></li>
<li><h3>Record</h3><p>One recording session produces a month of material.</p></li>
<li><h3>Deliver</h3><p>Edited videos and designed graphics, sized for each platform and ready to post.</p></li>
</ol></div></section>
<section class="sec stone"><div class="wrap"><div class="split">
<div class="pic pic--native">{img_tag(_split_pic, "(max-width: 900px) 100vw, 50vw") if _split_pic else ""}</div>
<div class="txt"><p class="eyebrow">What you get</p><h2>Content built for business, not just for likes.</h2>
{plain(["Monthly content plan","Recording session with lighting, audio and direction","Short-form videos for Reels, Shorts and TikTok","Graphic designs and promotional flyers","Files sized for each platform"])}
</div></div></div></section>
{_social_examples}
<section class="sec" id="services"><div class="wrap">
{sec_head("", "Two services", "Producing content and managing accounts are separate.")}
<div class="duo">
<div><p class="lbl">Core service</p><h3>Content production</h3><p class="prose">We plan, record, edit and design your content and deliver ready-to-post files. You publish them on your own accounts.</p><p>{cta_link("social")}</p></div>
<div><p class="lbl">Separate add-on</p><h3>Account management</h3><p class="prose">If you would also like us to look after your accounts, we scope that separately with you: which platforms, and what we handle. Nothing is included until it has been agreed with you.</p><p>{cta_link("social-management")}</p></div>
</div></div></section>
<section class="sec stone sec--tight" id="pricing"><div class="wrap">
{sec_head("", "Pricing", "Quoted after a short consultation.", "We agree what will be produced each month, then send a quote. Fixed packages with starting prices are being finalised.")}
<div class="actions"><a class="btn" href="{CTA["social"][1]}">Request a quote</a></div>
</div></section>
'''
SOCIAL_LD = json_ld(
    breadcrumb_ld(("Home", "/"), ("Creative", "/creative/"), ("Social Media Content", "/creative/social-media-content/")),
    {
        "@type": "Service",
        "@id": f"{SITE}/creative/social-media-content/#service",
        "name": "Social Media Content Production for Businesses in Kampala",
        "url": f"{SITE}/creative/social-media-content/",
        "provider": ORG_REF,
        "areaServed": {"@type": "City", "name": "Kampala"},
        "serviceType": [
            "Monthly Social Media Content Production",
            "Short-Form Video Production (Reels, Shorts, TikTok)",
            "Social Media Graphic Design",
            "Social Media Account Management",
        ],
    },
)
page("/creative/social-media-content/", "Social Media Content Production in Kampala | Synergy Concepts",
     "Business photography, short-form video and graphic design for social media, planned and recorded in one monthly session in Kampala, Uganda.",
     sm_body, "/creative/social-media-content/", schema=SOCIAL_LD, og_img=og_from_item("flyer-watches-2"))

# ---------- PRODUCTS ----------
prod_body = f'''
<section class="page-head"><div class="wrap"><p class="eyebrow">Products</p>
<h1>Software products built by Synergy Concepts Hub.</h1>
<p class="lede">Alongside client systems and creative work, Synergy Concepts Hub develops and maintains its own software products in Kampala, Uganda.</p></div></section>
<section class="sec"><div class="wrap">
<div class="cards">
<div class="card" id="quickcredit"><span class="k">In use &middot; Financial systems</span><h2 class="h3">QuickCredit</h2><p>Enterprise lending and credit management platform built for lending operations, combining borrower workflows, mobile money integration, credit scoring and real-time analytics.</p><p class="small"><a class="link" href="https://quickcreditclientportal.netlify.app/home" target="_blank" rel="noopener">View QuickCredit platform &#8599;</a></p></div>
<div class="card" id="sma-sync"><span class="k">In use &middot; Media workflows</span><h2 class="h3">SMA Sync</h2><p>Offline-first media synchronization software designed for creative production and training workflows where reliable local file synchronization is essential.</p><p class="small">Built by Synergy Concepts Hub. Used by Synergy Multimedia Academy. <!-- Internal product: do not add download, purchase, pricing or sign-up links unless Synergy decides to release it publicly. --></p></div>
<div class="card" id="recovery-tools"><span class="k">Coming soon</span><h2 class="h3">Creative &amp; Media Recovery Tools</h2><p>Practical utilities for creative production teams to organize, verify and recover photo and video files from studio and field shoots.</p></div>
</div>
<div class="prose" style="margin-top:72px">
<p>Each product grows out of real operational needs in business finance, media production and creative education. Dedicated product documentation and release details are published as products open to external organisations.</p>
</div>
</div></section>
<section class="sec stone sec--tight"><div class="wrap"><div class="actions" style="justify-content:space-between"><p class="prose">Interested in QuickCredit or our software products?</p><a class="link" href="/contact/?service=products">Get in touch &rarr;</a></div></div></section>
'''
PRODUCTS_LD = json_ld(
    breadcrumb_ld(("Home", "/"), ("Products", "/products/")),
    {
        "@type": "ItemList",
        "@id": f"{SITE}/products/#list",
        "name": "Software Products by Synergy Concepts Hub",
        "itemListElement": [
            {
                "@type": "ListItem",
                "position": 1,
                "item": {
                    "@type": "SoftwareApplication",
                    "name": "QuickCredit",
                    "applicationCategory": "BusinessApplication",
                    "operatingSystem": "Web",
                    "url": f"{SITE}/products/#quickcredit",
                    "description": "Enterprise lending platform with mobile money integration, credit scoring and real-time analytics.",
                    "creator": ORG_REF,
                },
            },
            {
                "@type": "ListItem",
                "position": 2,
                "item": {
                    "@type": "SoftwareApplication",
                    "name": "SMA Sync",
                    "applicationCategory": "MultimediaApplication",
                    "url": f"{SITE}/products/#sma-sync",
                    "description": "Offline-first media synchronization software for creative production workflows.",
                    "creator": ORG_REF,
                },
            },
        ],
    },
)
page("/products/", "Software Products: QuickCredit & SMA Sync | Synergy Concepts",
     "Proprietary software products built by Synergy Concepts Hub in Uganda, including the QuickCredit lending platform and SMA Sync media workflow tool.",
     prod_body, "/products/", schema=PRODUCTS_LD)

# ---------- WORK ----------
TECHW = [  # name, type, description, cats, link
    ("QuickCredit", "Business system", "Enterprise lending platform with mobile money, credit scoring and real-time analytics.", "technology", "https://quickcreditclientportal.netlify.app/home"),
    ("Solverscreations", "Business system", "Creative booking and client workflow platform.", "technology", "https://bookings-solverscreations.com/"),
    ("Afrisites Tours &amp; Travel", "Website and booking platform", "Digital tourism booking infrastructure across East Africa.", "technology websites", "https://afri-sites.vercel.app/"),
    ("Octagon Africa", "Website", "Corporate digital presence and enterprise web infrastructure.", "websites", "https://www.octagonafrica.com/"),
    ("Elgon Bottling Company", "Business system", "Enterprise brand systems for manufacturing operations.", "technology", "https://elgon-bottling.vercel.app/"),
    ("Diani Art Gallery", "Website", "Gallery branding and cultural showcase.", "websites", "https://diani-art-gallery-prod.vercel.app/"),
    ("Davy Cinematography", "Video", "Cinematic production and premium visual storytelling.", "video", "https://davycinematography.com/"),
]
tech_rows = ""
for name, kind, desc, cats, link in TECHW:
    tech_rows += f'<a class="row row--kind" data-cat="{cats}" href="{link}" target="_blank" rel="noopener"><span class="n">{kind}</span><span class="t">{name}</span><span class="d">{desc}</span><span class="a" aria-hidden="true">&#8599;</span></a>'

def work_block(category, title, page_href, cta_key, limit=6):
    """A short, curated block per creative category on the Work page (sets count once)."""
    its, seen, picked = items(category), set(), []
    for it in its:
        key = it.get("set") or it["id"]
        if key in seen:
            continue
        seen.add(key)
        picked.append(it)
        if len(picked) == limit:
            break
    if not picked:
        return ""
    keep = {it.get("set") or it["id"] for it in picked}
    sel = [it for it in its if (it.get("set") or it["id"]) in keep]
    return f'''<div class="wblock" data-cat="creative {category}" id="{category}">
<div class="wblock-head"><h2 class="wsub">{title}</h2><p class="wlinks"><a class="link" href="{page_href}">All {title.lower()} &rarr;</a>{cta_link(cta_key)}</p></div>
{gallery(sel, "c3", "work-" + category)}</div>'''

_work_creative = work_block("photography", "Photography", "/creative/photography/", "photography") + \
                 work_block("design", "Design", "/creative/design/", "design")

_FILTERS = [("all", "All"), ("creative", "Creative"), ("photography", "Photography"), ("design", "Design"),
            ("technology", "Technology"), ("websites", "Websites"), ("video", "Video")]
import re
_cats_present = {c for m in re.findall(r'data-cat="([^"]+)"', _work_creative + tech_rows) for c in m.split()}
filter_btns = "".join(
    f'<button data-filter="{k}" aria-pressed="{"true" if k == "all" else "false"}">{label}</button>'
    for k, label in _FILTERS if k == "all" or k in _cats_present)

work_body = f'''
<section class="page-head"><div class="wrap"><p class="eyebrow">Work</p>
<h1>Selected photography, design, systems and websites.</h1>
<p class="lede">Photography, design, systems and websites for businesses in Uganda and across East Africa.</p></div></section>
<section class="sec dark"><div class="wrap">
<div class="filters" role="group" aria-label="Filter work">{filter_btns}</div>
<div data-group id="creative">{_work_creative}</div>
<div data-group id="technology" style="margin-top:72px"><h2 class="wsub">Technology and websites</h2><div class="rows" id="websites">{tech_rows}</div></div>
</div></section>
{cta_band("Want to see something specific?")}
'''
WORK_LD = json_ld(
    breadcrumb_ld(("Home", "/"), ("Work", "/work/")),
    {
        "@type": "CollectionPage",
        "@id": f"{SITE}/work/#collection",
        "name": "Selected Work: Photography, Design, Business Systems and Websites",
        "url": f"{SITE}/work/",
        "description": "Selected commercial photography, graphic design, business systems and websites by Synergy Concepts Hub in Kampala, Uganda.",
        "about": ORG_REF,
    },
)
page("/work/", "Selected Work: Photography, Design & Systems | Synergy Uganda",
     "Selected commercial photography, brand identity, company profiles, business systems and websites delivered by Synergy Concepts Hub in Uganda.",
     work_body, "/work/", schema=WORK_LD, og_img=og_from_item("matsen-01"))

# ---------- CASE STUDIES (only when the case and all its pages are approved) ----------
CASE_URLS = []
for _c in _MANIFEST.get("cases", []):
    if case_for_set(_c["set"]) is not _c:
        continue
    _pages = [x for x in ITEMS if x.get("set") == _c["set"]]
    if not _pages:
        continue
    def _fact(label, val):
        if val:
            return f'<div><dt>{label}</dt><dd>{esc(val)}</dd></div>'
        return f'<div><dt>{label}</dt><dd><span class="pend">To be supplied</span></dd></div>' if PREVIEW else ""
    _facts = _fact("Client", _c.get("client")) + _fact("Brief", _c.get("brief")) + _fact("Our role", _c.get("role")) + _fact("Deliverables", _c.get("deliverables"))
    _pend = '<span class="pend">Pending case study</span>' if _c["status"] != "approved" else ""
    _body = f'''
<section class="page-head"><div class="wrap"><p class="eyebrow"><a href="/work/" style="text-decoration:none">Work</a> &nbsp;/&nbsp; Case study {_pend}</p>
<h1>{esc(_c["title"])}</h1></div></section>
<section class="sec"><div class="wrap">
<dl class="facts">{_facts}</dl>
<div class="gal gal--c2">{"".join(figure(x, "case", GAL_SIZES["c2"]) for x in _pages)}</div>
</div></section>
{cta_band("Need something similar?", CTA["design"][0], CTA["design"][1])}
'''
    _url = f'/work/{_c["slug"]}/'
    _case_ld = json_ld(
        breadcrumb_ld(("Home", "/"), ("Work", "/work/"), (_c["title"], _url)),
    )
    page(_url, f'{_c["title"]} | Synergy Concepts Hub', f'Case study: {_c["title"]}.', _body, "/work/", schema=_case_ld)
    CASE_URLS.append(_url)

# ---------- ABOUT ----------
about_body = f'''
<section class="page-head"><div class="wrap"><p class="eyebrow">About</p>
<h1>About Synergy Concepts Hub in Kampala, Uganda.</h1>
<p class="lede">Synergy Concepts Hub is a Kampala-based technology and business creative company building software systems, websites, photography, design and digital products for growing organisations.</p></div></section>
<section class="sec"><div class="wrap">
{sec_head("", "Structure", "One company across technology, creative and education.")}
<div class="rows">
<div class="row"><span class="n">01</span><span class="t">Synergy Concepts Hub</span><span class="d">The main consolidated company for business technology, creative production and proprietary software products such as QuickCredit and SMA Sync.</span></div>
<a class="row" href="/creative/photography/"><span class="n">02</span><span class="t">Synergy Capture Films</span><span class="d">Our commercial photography and video production division: corporate portraits, studio sessions, product photography, weddings and business video.</span><span class="a" aria-hidden="true">&rarr;</span></a>
<a class="row" href="/creative/design/"><span class="n">03</span><span class="t">Synergy Creative Hub</span><span class="d">Our graphic design and branding division: logos, brand identity systems, company profiles, presentations and promotional collateral.</span><span class="a" aria-hidden="true">&rarr;</span></a>
<a class="row" href="{SMA}" target="_blank" rel="noopener"><span class="n">04</span><span class="t">Synergy Multimedia Academy</span><span class="d">Our dedicated education brand offering practical courses, holiday programs and multimedia training on its own website.</span><span class="a" aria-hidden="true">&#8599;</span></a>
</div></div></section>
<section class="sec stone"><div class="wrap">
{sec_head("", "How we work", "Understand, build, support.")}
<ol class="steps">
<li><h3>Understand</h3><p>We start by understanding the business, the operational or creative need, and what needs to change.</p></li>
<li><h3>Build</h3><p>We design, photograph and build practical software, websites and visual work around that need.</p></li>
<li><h3>Support</h3><p>We stay involved where ongoing maintenance, managed hosting or recurring creative production is required.</p></li>
</ol>
<!-- PLACEHOLDER: founder or team introduction and company story. Add only information supplied by Synergy. -->
</div></section>
{cta_band()}
'''
ABOUT_LD = json_ld(
    breadcrumb_ld(("Home", "/"), ("About", "/about/")),
    {
        "@type": "AboutPage",
        "@id": f"{SITE}/about/#webpage",
        "name": "About Synergy Concepts Hub",
        "url": f"{SITE}/about/",
        "mainEntity": ORG_ENTITY,
    },
)
page("/about/", "About Synergy Concepts Hub | Technology & Creative, Uganda",
     "Synergy Concepts Hub is a Kampala-based technology and creative company operating Synergy Capture Films, Synergy Creative Hub and Synergy Multimedia Academy.",
     about_body, "/about/", schema=ABOUT_LD)

# ---------- CONTACT ----------
contact_body = f'''
<section class="page-head"><div class="wrap"><p class="eyebrow">Contact</p>
<h1>Contact Synergy Concepts Hub to start a project.</h1>
<p class="lede">Tell us what you need across business software, websites, photography, graphic design or social media content. A short description is enough and we reply within 24 hours.</p></div></section>
{contact_block("").replace('<section class="sec  ', '<section class="sec ')}
'''
# the contact page reuses the block without its own heading
contact_body = contact_body.replace(sec_head("", "Contact", "Start a project.", "Tell us what you need. A short description is enough. We reply within 24 hours."), "")
CONTACT_LD = json_ld(
    breadcrumb_ld(("Home", "/"), ("Contact", "/contact/")),
    {
        "@type": "ContactPage",
        "@id": f"{SITE}/contact/#webpage",
        "name": "Contact Synergy Concepts Hub",
        "url": f"{SITE}/contact/",
        "mainEntity": ORG_REF,
    },
)
page("/contact/", "Contact Synergy Concepts Hub | Start a Project in Kampala",
     "Contact Synergy Concepts Hub in Kampala, Uganda by form, phone (+256 706 739 311), WhatsApp or email to start a technology or creative project.",
     contact_body, "/contact/", schema=CONTACT_LD)

# ---------- 404 (top-level 404.html so Cloudflare Pages returns a real 404, not the homepage) ----------
not_found_body = '''
<section class="page-head"><div class="wrap"><p class="eyebrow">404</p>
<h1>Page not found.</h1>
<p class="lede">The page you are looking for does not exist or has moved.</p>
<div class="actions" style="margin-top:32px"><a class="btn" href="/">Back to the homepage</a></div></div></section>
'''
page("/404", "Page not found | Synergy Concepts Hub",
     "The page you are looking for does not exist or has moved.",
     not_found_body, "", out_file="404.html")

# ---------- sitemap, robots, redirects ----------
urls = ["/", "/technology/", "/creative/", "/creative/photography/", "/creative/design/",
        "/creative/social-media-content/", "/products/", "/work/"] + CASE_URLS + ["/about/", "/contact/"]
_smap_lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for u in urls:
    _lmod = PAGE_LASTMOD.get(u) or SOURCE_LASTMOD
    _smap_lines.append(f"  <url><loc>{SITE}{u}</loc><lastmod>{_lmod}</lastmod></url>")
_smap_lines.append("</urlset>\n")
_smap_out = "\n".join(_smap_lines)
_smap_path = os.path.join(ROOT, "sitemap.xml")
if not (os.path.exists(_smap_path) and open(_smap_path, encoding="utf8").read() == _smap_out):
    with open(_smap_path, "w", encoding="utf8", newline="\n") as f:
        f.write(_smap_out)
_robots_out = "User-agent: *\nDisallow: /\n" if PREVIEW else f"User-agent: *\nAllow: /\n\nSitemap: {SITE}/sitemap.xml\n"
_robots_path = os.path.join(ROOT, "robots.txt")
if not (os.path.exists(_robots_path) and open(_robots_path, encoding="utf8").read() == _robots_out):
    with open(_robots_path, "w", encoding="utf8", newline="\n") as f:
        f.write(_robots_out)
_redir_out = "/social-media-management.html /creative/social-media-content/ 301\n/social-media-management /creative/social-media-content/ 301\n"
_redir_path = os.path.join(ROOT, "_redirects")
if not (os.path.exists(_redir_path) and open(_redir_path, encoding="utf8").read() == _redir_out):
    with open(_redir_path, "w", encoding="utf8", newline="\n") as f:
        f.write(_redir_out)
if PREVIEW:
    # The preview is a self-contained copy: shared assets plus the pending images build_images.py put here.
    shutil.copytree(os.path.join(SRC, "assets"), os.path.join(ROOT, "assets"), dirs_exist_ok=True)

_counts = {}
for it in ITEMS:
    _counts[it["status"]] = _counts.get(it["status"], 0) + 1
print("built", len(urls), "pages", "(REVIEW PREVIEW in _review/preview/)" if PREVIEW else "(public site)")
if PREVIEW:
    print("Open _review/preview/index.html directly, or run: python preview.py  (http://localhost:8000/)")
print("portfolio items shown:", ", ".join(f"{k} {v}" for k, v in sorted(_counts.items())) or "none")
print("Content flags: selected clients", "shown" if SHOW_SELECTED_CLIENTS else "HIDDEN")
