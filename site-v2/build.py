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

# ---- Business destinations (information architecture, Oct 2026) ----
# The four Synergy businesses are the primary navigation. Synergy Concepts Hub is the parent company and
# also the home of its own technology services and software products. Each business has a section bar
# (secondary navigation) shown on its pages: pages declare their business with page(..., biz=KEY).
# Shared corporate pages (Work, About, Contact) belong to no business.
BUSINESSES = {
    "sch": {
        "name": "Synergy Concepts Hub", "short": "Concepts Hub", "tag": "Technology &amp; products",
        "href": "/technology/",
        "sub": [("Technology", "/technology/"), ("Products", "/products/"),
                ("Technology work", "/work/#technology"), ("Start a Project", "/contact/?service=technology")],
    },
    "films": {
        "name": "Synergy Capture Films", "short": "Capture Films", "tag": "Photography &amp; video",
        "href": "/capture-films/",
        "sub": [("Overview", "/capture-films/"), ("Events", "/capture-films/events/"),
                ("Weddings &amp; Ceremonies", "/capture-films/weddings/"), ("Portraits &amp; Studio", "/capture-films/photography/"),
                ("Videography", "/capture-films/videography/"), ("Our Work", "/work/#photography"), ("Get a Quote", "/capture-films/quote/")],
    },
    "creative": {
        "name": "Synergy Creative Hub", "short": "Creative Hub", "tag": "Design &amp; content",
        "href": "/creative-hub/",
        "sub": [("Overview", "/creative-hub/"), ("Design &amp; Branding", "/creative-hub/design/"),
                ("Social Media Content", "/creative-hub/social-media-content/"),
                ("Our Work", "/work/#design"), ("Send a Brief", "/creative-hub/brief/")],
    },
    "academy": {
        "name": "Synergy Multimedia Academy", "short": "Multimedia Academy", "tag": "Courses &amp; training",
        "href": "/academy/",
        "sub": [("Overview", "/academy/"), ("Courses &amp; admissions", SMA)],
    },
}
BIZ_ORDER = ["sch", "films", "creative", "academy"]

def esc(s): return html.escape(s, quote=True)
SUPPORT_NAV = [("Our Work", "/work/"), ("About", "/about/")]
# The last secondary link of a business is its enquiry action, shown with the accent.
_CTA_LABELS = {"Start a Project", "Get a Quote", "Send a Brief"}

def ext_link(label, href, cls=""):
    """External link (other Synergy sites, social channels): opens in a new tab, says so to screen readers."""
    c = f' class="{cls}"' if cls else ""
    return (f'<a{c} href="{href}" target="_blank" rel="noopener">{label}&nbsp;<span aria-hidden="true">&#8599;</span>'
            f'<span class="vh"> (opens another website)</span></a>')

def section_bar(biz, current):
    b = BUSINESSES[biz]
    lis = ""
    for label, href in b["sub"]:
        if href.startswith("http"):
            lis += f"<li>{ext_link(label, href)}</li>"
            continue
        cur = ' aria-current="page"' if current == href else ""
        cls = ' class="secbar-cta"' if label in _CTA_LABELS else ""
        lis += f'<li><a href="{href}"{cls}{cur}>{label}</a></li>'
    return (f'<nav class="secbar" aria-label="{b["name"]}"><div class="secbar-in">'
            f'<a class="secbar-name" href="{b["href"]}">{b["name"]}</a><ul>{lis}</ul></div></nav>')

def header(current, biz=None):
    links = ""
    for key in BIZ_ORDER:
        b = BUSINESSES[key]
        cur = ' aria-current="page"' if current == b["href"] else (' aria-current="true"' if key == biz else "")
        links += (f'<li class="nav-biz"><a href="{b["href"]}"{cur}><span class="nb">{b["short"]}</span>'
                  f'<span class="nt">{b["tag"]}</span></a></li>')
    links += '<li class="nav-gap" aria-hidden="true"></li>'
    for label, href in SUPPORT_NAV:
        cur = ' aria-current="page"' if current == href else ""
        links += f'<li class="nav-sup"><a href="{href}"{cur}>{label}</a></li>'
    actions = (
        f'<a class="nav-portal" href="{PORTAL}">Portal&nbsp;&#8594;</a>'
        '<a class="btn" href="/contact/">Start a Project</a>'
    )
    bar = section_bar(biz, current) if biz else ""
    return f'''<a class="skip" href="#main">Skip to content</a>
<header class="site-header"><div class="hdr">
<a class="brand" href="/" aria-label="Synergy Concepts Hub, home"><img src="{IMG}logo-mark-light.png" alt="" width="30" height="30"><span>Synergy Concepts Hub</span></a>
<button class="menu-btn" aria-expanded="false" aria-controls="nav">Menu</button>
<nav class="nav" id="nav" aria-label="Main"><ul class="nav-links">{links}</ul><div class="nav-actions">{actions}</div></nav>
</div></header>
{bar}'''

def _flinks(lst):
    return "".join(f'<li><a href="{h}">{l}</a></li>' for l, h in lst)

FOOTER = f'''<footer class="site-footer"><div class="wrap">
<div class="grid">
<div><a class="brand" href="/"><img src="{IMG}logo-mark-light.png" alt="" width="30" height="30"><span>Synergy Concepts Hub</span></a>
<p class="about">Technology company in Kampala, Uganda, and the parent company of Synergy Capture Films, Synergy Creative Hub and Synergy Multimedia Academy.</p></div>
<div><p class="lbl">Concepts Hub</p><ul>{_flinks([
    ("Business Systems", "/technology/#business-systems"), ("Web &amp; Digital Platforms", "/technology/#web-digital-platforms"),
    ("AI &amp; Automation", "/technology/#ai-automation"), ("Managed Technology", "/technology/#managed-technology"),
    ("Products", "/products/")])}</ul></div>
<div><p class="lbl">Capture Films</p><ul>{_flinks([
    ("Events", "/capture-films/events/"), ("Weddings &amp; Ceremonies", "/capture-films/weddings/"),
    ("Portraits &amp; Studio", "/capture-films/photography/"), ("Videography", "/capture-films/videography/"),
    ("Get a Quote", "/capture-films/quote/")])}</ul></div>
<div><p class="lbl">Creative Hub</p><ul>{_flinks([
    ("Overview", "/creative-hub/"), ("Design &amp; Branding", "/creative-hub/design/"),
    ("Social Media Content", "/creative-hub/social-media-content/"),
    ("Campaign Production", "/creative-hub/#campaign-content-production"), ("Send a Brief", "/creative-hub/brief/")])}</ul></div>
<div><p class="lbl">Company</p><ul>{_flinks([
    ("Multimedia Academy", "/academy/"), ("Our Work", "/work/"), ("About", "/about/"), ("Contact", "/contact/"),
    ("Portal", PORTAL)])}</ul></div>
<div><p class="lbl">Elsewhere</p><ul>
<li><a href="{SMA}" target="_blank" rel="noopener">Academy website &#8599;</a></li>
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
ASSET_V = {"css": _asset_version("assets/css/sch.css"), "js": _asset_version("assets/js/sch.js"),
           "qb": _asset_version("assets/js/quote-builder.js")}

# Output folders of pages that moved to a business section (old URLs now 301-redirect, see _redirects).
# They are generated files only; removing them keeps stale copies out of the deploy folder.
RETIRED_OUTPUT_DIRS = ["creative"]
for _d in RETIRED_OUTPUT_DIRS:
    _p = os.path.join(ROOT, _d)
    if os.path.isdir(_p):
        shutil.rmtree(_p)

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

def page(path, title, desc, body, current="", schema="", out_file=None, og_img=None, biz=None, extra_js=()):
    url = SITE + path
    # data-business: which Synergy business a page belongs to (parent-level pages: "sch-group").
    # A stable hook for business-level attribution if analytics is added later; no tracking runs today.
    body_attr = f' data-business="{biz or "sch-group"}"' + (' class="has-secbar"' if biz else "")
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
<link rel="apple-touch-icon" href="{IMG}app/apple-touch-icon.png">
<link rel="manifest" href="/manifest.json">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Sora:wght@600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/sch.css?v={ASSET_V["css"]}">
{schema}
</head>
<body{body_attr}>
{header(current, biz)}
<main id="main">
{body}
</main>
{FOOTER}
<script src="/assets/js/sch.js?v={ASSET_V["js"]}" defer></script>{"".join(f'<script src="/assets/js/{n}.js?v={ASSET_V[k]}" defer></script>' for n, k in extra_js)}
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

CONTACT_DL = f'''<dl>
<div><dt>Email</dt><dd><a href="mailto:{EMAIL}">{EMAIL}</a></dd></div>
<div><dt>Phone and WhatsApp</dt><dd><a href="tel:{PHONE_TEL}">{PHONE_DISPLAY}</a> &middot; <a href="{WHATSAPP}" target="_blank" rel="noopener">WhatsApp</a></dd></div>
<div><dt>Location</dt><dd>Kampala, Uganda</dd></div>
</dl>'''

ACADEMY_NOTE = (f'<p class="small">Looking for courses or training? Visit '
                f'<a class="link" href="{SMA}" target="_blank" rel="noopener">Synergy Multimedia Academy &#8599;</a></p>')

def contact_block(sec_cls="dark"):
    return f'''<section class="sec {sec_cls}" id="contact"><div class="wrap">
{sec_head("", "Contact", "Start a project.", "Tell us what you need. A short description is enough. We reply within 24 hours.")}
<div class="contact">
<div class="info">{CONTACT_DL}
{ACADEMY_NOTE}</div>
<div class="form">{form_html()}</div>
</div></div></section>'''

# Enquiry options, grouped by the business that delivers them. The option values are what the portal's
# /api/quote receives (mapped to its lead categories in sch.js); data-business is written into the brief
# ("Business: ...") so each lead shows which Synergy business it is for. Values are never renamed:
# existing ?service= links and portal records depend on them.
FORM_GROUPS = [
    ("films", "Synergy Capture Films", [
        ("events", "Events: corporate, conferences, celebrations"), ("weddings", "Weddings"), ("kukyala", "Kukyala"),
        ("introduction", "Introduction ceremony"), ("photography", "Portraits, studio or product photography"),
        ("video", "Business or promotional video")]),
    ("creative", "Synergy Creative Hub", [
        ("design", "Graphic Design &amp; Branding"), ("social", "Social Media Content"),
        ("social-management", "Social Media Management"), ("campaign", "Campaign &amp; Content Production"),
        ("creative", "Other creative work")]),
    ("sch", "Synergy Concepts Hub", [
        ("technology", "Systems, websites or automation"), ("products", "Products")]),
]

def form_html(scope=None, business=""):
    """The enquiry form (id="enquiry", handled by sch.js). scope: business keys to offer (default: all).
    business: the form-level business name, used when "Other" is chosen on a business page."""
    groups = [g for g in FORM_GROUPS if scope is None or g[0] in scope]
    opts = ""
    for _key, name, options in groups:
        inner = "".join(f'<option value="{v}" data-business="{name}">{l}</option>' for v, l in options)
        opts += f'<optgroup label="{name}">{inner}</optgroup>' if len(groups) > 1 else inner
    biz_attr = f' data-business="{business}"' if business else ""
    return f'''<form id="enquiry" novalidate{biz_attr}>
<div class="two">
<div class="field"><label for="f-name">Name</label><input id="f-name" name="name" type="text" required autocomplete="name"></div>
<div class="field"><label for="f-email">Email</label><input id="f-email" name="email" type="email" required autocomplete="email"></div>
</div>
<div class="two">
<div class="field"><label for="f-phone">Phone or WhatsApp (optional)</label><input id="f-phone" name="phone" type="tel" autocomplete="tel"></div>
<div class="field"><label for="f-service">What do you need?</label><select id="f-service" name="service" required>
<option value="">Select</option>
{opts}
<option value="other">Other</option></select></div>
</div>
<div class="field"><label for="f-brief">About your project</label><textarea id="f-brief" name="brief" required></textarea></div>
<div class="hp" aria-hidden="true"><label for="f-website">Website</label><input id="f-website" name="website" type="text" tabindex="-1" autocomplete="off"></div>
<div class="form-foot"><button class="btn" type="submit">Send enquiry</button><p id="formStatus" role="status"></p></div>
</form>'''

def cta_band(text="Have a project in mind?", label="Start a Project", href="/contact/"):
    return f'''<section class="sec dark sec--tight"><div class="wrap"><div class="actions" style="justify-content:space-between">
<h2 style="max-width:22ch">{text}</h2><a class="btn" href="{href}">{label}</a></div></div></section>'''

# Enquiry links: each opens the business's own enquiry page with the right service pre-selected.
QUOTE = "/capture-films/quote/"
BRIEF = "/creative-hub/brief/"
CTA = {
    "photography": ("Request a photography quote", f"{QUOTE}?service=photography"),
    "events": ("Request an event quote", f"{QUOTE}?service=events"),
    "weddings": ("Request a wedding quote", f"{QUOTE}?service=weddings"),
    "kukyala": ("Request a Kukyala quote", f"{QUOTE}?service=kukyala"),
    "introduction": ("Request an introduction quote", f"{QUOTE}?service=introduction"),
    "video": ("Request a video quote", f"{QUOTE}?service=video"),
    "design": ("Request a design quote", f"{BRIEF}?service=design"),
    "social": ("Get a content quote", f"{BRIEF}?service=social"),
    "social-management": ("Ask about account management", f"{BRIEF}?service=social-management"),
    "campaign": ("Plan a campaign", f"{BRIEF}?service=campaign"),
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
    "description": "Technology company in Kampala, Uganda, and parent company of Synergy Capture Films (photography and video), Synergy Creative Hub (graphic design, branding and content) and Synergy Multimedia Academy (training). Builds business systems, websites, automation and software products.",
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
            "url": f"{SITE}/capture-films/",
            "description": "Photography and video business of Synergy Concepts Hub in Kampala, Uganda: events, weddings, Kukyala and introduction ceremonies, portraits, studio and product photography, and business video.",
        },
        {
            "@type": "Organization",
            "name": "Synergy Creative Hub",
            "url": f"{SITE}/creative-hub/",
            "description": "Graphic design, brand identity, social media content and campaign production business of Synergy Concepts Hub in Kampala, Uganda.",
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

PRODUCT_ROWS = f'''<div class="rows rows--sm">
<a class="row row--kind" href="/products/#quickcredit"><span class="n">In use</span><span class="t">QuickCredit</span><span class="d">Enterprise lending platform with mobile money integration, credit scoring and real-time analytics.</span><span class="a" aria-hidden="true">&rarr;</span></a>
<a class="row row--kind" href="/products/#sma-sync"><span class="n">In use</span><span class="t">SMA Sync</span><span class="d">Offline-first media synchronization software for creative production workflows. Built by Synergy. Used by SMA.</span><span class="a" aria-hidden="true">&rarr;</span></a>
<a class="row row--kind" href="/products/#recovery-tools"><span class="n">Coming soon</span><span class="t">Creative and media recovery tools</span><span class="d">Tools for creative production, and for recovering and organizing photo and video files.</span><span class="a" aria-hidden="true">&rarr;</span></a>
</div>'''

def any_link(label, href):
    return ext_link(label, href) if href.startswith("http") else f'<a href="{href}">{label}</a>'

def static_img(name, w, h, alt, eager=False):
    load = 'loading="eager" fetchpriority="high"' if eager else 'loading="lazy"'
    return f'<img src="{IMG}{name}" alt="{esc(alt)}" width="{w}" height="{h}" {load} decoding="async">'

def item_by_id(item_id):
    return next((it for it in ITEMS if it["id"] == item_id), None)

def pic_for(item_id, fallback):
    """A portfolio image if that item is approved, otherwise a fallback static image (name, w, h, alt)."""
    it = item_by_id(item_id)
    return img_tag(it, "(max-width: 900px) 100vw, 40vw") if it else static_img(*fallback)

# The four business destinations, as shown on the homepage. Copy states only services the site already offers.
DESTINATIONS = [
    ("sch", "01", "Business software, websites, automation and managed technology, and our own software products, built and supported in Kampala.",
     [("Business Systems", "/technology/#business-systems"), ("Websites &amp; platforms", "/technology/#web-digital-platforms"),
      ("AI &amp; Automation", "/technology/#ai-automation"), ("Products", "/products/")],
     "Go to Concepts Hub",
     static_img("brand-stationery.jpg", 1400, 1400, "Synergy Concepts Hub stationery: notebook, letterhead, business card and mug")),
    ("films", "02", "Photography and video for events, weddings, Kukyala and introduction ceremonies, plus portraits, product shoots and business video.",
     [("Events", "/capture-films/events/"), ("Weddings &amp; Ceremonies", "/capture-films/weddings/"),
      ("Videography", "/capture-films/videography/"), ("Get a Quote", "/capture-films/quote/")],
     "Go to Capture Films",
     pic_for("wed-vannie-5", ("studio-portrait.jpg", 1000, 1500, "Studio portrait by Synergy Capture Films"))),
    ("creative", "03", "Logos and brand identity, company profiles, promotional design, and monthly social media content.",
     [("Design &amp; Branding", "/creative-hub/design/"), ("Social Media Content", "/creative-hub/social-media-content/"),
      ("Campaign Production", "/creative-hub/#campaign-content-production"), ("Send a Brief", "/creative-hub/brief/")],
     "Go to Creative Hub",
     static_img("design-matsen.jpg", 1400, 788, "Company profile designed by Synergy Creative Hub")),
    ("academy", "04", "Practical courses and intakes, monthly masterclasses, Project Lab and holiday programmes for the next generation of creators.",
     [("About the Academy", "/academy/"), ("Courses &amp; admissions", SMA)],
     "Go to the Academy",
     static_img("sma-learning.jpg", 1400, 933, "A student editing photos on a laptop at Synergy Multimedia Academy")),
]

def destinations():
    out = '<div class="bizlist">'
    for key, n, prop, links, go, pic in DESTINATIONS:
        b = BUSINESSES[key]
        lis = "".join(f"<li>{any_link(l, h)}</li>" for l, h in links)
        out += f'''<article class="biz" id="biz-{key}" aria-labelledby="h-biz-{key}">
<div class="biz-head"><span class="n">{n}</span><h3 id="h-biz-{key}"><a href="{b["href"]}">{b["name"]}</a></h3><p class="lbl">{b["tag"]}</p></div>
<div class="biz-body"><p class="biz-prop">{prop}</p><ul class="biz-links">{lis}</ul>
<a class="link" href="{b["href"]}">{go} &rarr;</a></div>
<a class="biz-pic" href="{b["href"]}" tabindex="-1" aria-hidden="true">{pic}</a>
</article>'''
    return out + "</div>"

CLIENTS_STRIP = '''<div class="clients"><div class="wrap"><span class="label">Selected clients</span><span>QuickCredit</span><span>Afrisites</span><span>Octagon Africa</span><span>Elgon Bottling</span><span>Ecotrust</span><span>Diani Art Gallery</span></div></div>''' if SHOW_SELECTED_CLIENTS else '<!-- Selected clients line hidden until client names are approved for public display (SHOW_SELECTED_CLIENTS in build.py) -->'

# Selected work: items flagged "home" in portfolio.json (approved only, even in the preview),
# shown in justified pairs at their native proportions, then one technology project.
def item_page(it):
    if it["category"] == "photography":
        return "/capture-films/weddings/" if it["group"] == "weddings" else "/capture-films/photography/"
    return "/creative-hub/design/"
CAT_LABEL = {"photography": "Photography &middot; Capture Films", "design": "Design &middot; Creative Hub"}

def selected_work():
    picks = sorted((it for it in ITEMS if it.get("home") and it["status"] == "approved"), key=lambda it: it["home"])[:4]
    out = ""
    for i in range(0, len(picks), 2):
        out += '<div class="jrow">'
        for it in picks[i:i + 2]:
            s = _SIZES[it["id"]]["files"]["full"]
            out += (f'<figure class="ji" style="--ar:{s[1] / s[2]:.4f}"><a href="{item_page(it)}">'
                    f'{img_tag(it, "(max-width: 560px) 100vw, 50vw")}</a>'
                    f'<figcaption><b>{esc(it["caption"])}</b><span>{CAT_LABEL[it["category"]]}</span></figcaption></figure>')
        out += "</div>"
    return out

home = f'''
<section class="hero"><div class="wrap">
<p class="eyebrow">Synergy Concepts Hub &middot; Kampala, Uganda</p>
<h1>One company. Four Synergy businesses.</h1>
<p class="lede">Synergy Concepts Hub builds business software, websites and its own software products. Through Synergy Capture Films, Synergy Creative Hub and Synergy Multimedia Academy, it also photographs and films, designs, and trains. Choose the business that fits what you need.</p>
<div class="actions"><a class="btn" href="/contact/">Start a Project</a><a class="link" href="#businesses">Find the right business &darr;</a></div>
</div></section>
{CLIENTS_STRIP}

<section class="sec" id="businesses"><div class="wrap">
{sec_head("01", "Our businesses", "Four businesses, one point of contact.", "Each Synergy business has its own team and its own services. Not sure which one you need? Tell us about the project and we will pass it to the right team.")}
{destinations()}
</div></section>

<section class="sec stone" id="technology"><div class="wrap">
{sec_head("02", "Concepts Hub &middot; Technology", "Systems, platforms and automation, built properly and looked after.")}
{rows(TECH)}
</div></section>

<section class="sec sec--work" id="work"><div class="wrap">
<div class="sel-head"><p class="eyebrow">Selected work</p>
<p class="sel-links"><a class="link" href="/capture-films/photography/">Photography &rarr;</a><a class="link" href="/creative-hub/design/">Design &rarr;</a><a class="link" href="/work/">All work &rarr;</a></p></div>
{selected_work()}
<div class="rows" style="margin-top:48px">
<a class="row row--kind" href="/work/#technology"><span class="n">Business system</span><span class="t">QuickCredit</span><span class="d">Lending platform with mobile money, credit scoring and live analytics.</span><span class="a" aria-hidden="true">&rarr;</span></a>
</div>
</div></section>

<section class="sec stone sec--tight" id="products"><div class="wrap">
{sec_head("03", "Products", "We also build our own software.")}
{PRODUCT_ROWS}
</div></section>

{contact_block()}
'''
page("/", "Synergy Concepts Hub | Technology, Creative & Training in Uganda",
     "Synergy Concepts Hub, Kampala: business software and products, and the parent company of Synergy Capture Films, Synergy Creative Hub and Synergy Multimedia Academy.",
     home, schema=HOME_LD)

# ---------- TECHNOLOGY ----------
def svc(id_, n, title, intro, deliver, suited, work=""):
    w = f'<div><h3 class="lbl">Related work</h3>{work}</div>' if work else ""
    return f'''<article class="svc" id="{id_}"><div class="head"><span class="n">{n}</span><h2>{title}</h2></div>
<div class="body"><p class="lede">{intro}</p>
<div class="cols"><div><h3 class="lbl">What we deliver</h3>{plain(deliver)}</div><div><h3 class="lbl">Suited to</h3><p class="prose">{suited}</p>{"<div style='margin-top:28px'>"+w+"</div>" if w else ""}</div></div></div></article>'''

tech_body = f'''
<section class="page-head"><div class="wrap"><p class="eyebrow">Synergy Concepts Hub &middot; Technology</p>
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
<section class="sec" id="products"><div class="wrap">
{sec_head("", "Products", "Software we build and run ourselves.")}
{PRODUCT_ROWS}
</div></section>
{cta_band("Tell us what you need to build.", "Start a Project", "/contact/?service=technology")}
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
     tech_body, "/technology/", schema=TECH_LD, biz="sch")

# ---------- BUSINESS SECTION HELPERS ----------
PHOTO_GROUPS = [  # key, title, description, gallery columns
    ("portraits", "Portraits &amp; headshots", "Professional portraits for company profiles, websites and personal branding.", "c3"),
    ("studio", "Studio sessions", "Personal, couple and graduation portraits, photographed in the studio.", "c3"),
    ("product", "Product &amp; brand", "Products, and the people using them, photographed for brand and social media use.", "c3"),
]
WEDDING_GROUPS = [
    ("weddings", "Weddings &amp; ceremonies", "Weddings, introduction ceremonies and traditional ceremonies.", "c3"),
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

def crumb(biz, label):
    b = BUSINESSES[biz]
    return f'<p class="eyebrow"><a href="{b["href"]}" style="text-decoration:none">{b["name"]}</a> &nbsp;/&nbsp; {label}</p>'

def biz_head(biz, h1, lede, actions):
    """Page head for a business landing page: the business name, and its place in the parent company."""
    b = BUSINESSES[biz]
    return f'''<section class="page-head"><div class="wrap"><p class="eyebrow">{b["name"]} &middot; <a href="/" style="text-decoration:none">Part of Synergy Concepts Hub</a></p>
<h1>{h1}</h1>
<p class="lede">{lede}</p>
<div class="actions" style="margin-top:36px">{actions}</div></div></section>'''

BIZ_SUMMARY = {
    "sch": "Business software, websites, automation and our own software products.",
    "films": "Photography and video for events, weddings, Kukyala and introduction ceremonies, and for businesses.",
    "creative": "Brand identity, company profiles, promotional design and social media content.",
    "academy": "Practical courses, masterclasses, Project Lab and holiday programmes.",
}

def other_businesses(key, sec_cls=""):
    out = ""
    for k in BIZ_ORDER:
        if k == key:
            continue
        b = BUSINESSES[k]
        out += (f'<a class="row row--kind" href="{b["href"]}"><span class="n">{b["tag"]}</span><span class="t">{b["name"]}</span>'
                f'<span class="d">{BIZ_SUMMARY[k]}</span><span class="a" aria-hidden="true">&rarr;</span></a>')
    return f'''<section class="sec sec--tight {sec_cls}" id="other-businesses"><div class="wrap">
{sec_head("", "Synergy Concepts Hub", "The other Synergy businesses.")}
<div class="rows rows--sm">{out}</div>
<p style="margin-top:32px"><a class="link" href="/">Synergy Concepts Hub home &rarr;</a></p></div></section>'''

def enquiry_body(biz, label, h1, lede, guide, scope, extra=""):
    """A business's own enquiry page: what to include, contact details, and the shared enquiry form
    limited to that business's services."""
    b = BUSINESSES[biz]
    return f'''
<section class="page-head"><div class="wrap">{crumb(biz, label)}
<h1>{h1}</h1>
<p class="lede">{lede}</p></div></section>
<section class="sec" id="enquiry-form"><div class="wrap"><div class="contact">
<div class="info"><div><h2 class="h3" style="margin-bottom:20px">What to tell us</h2>{plain(guide)}</div>
{CONTACT_DL}{extra}</div>
<div class="form">{form_html(scope, b["name"])}</div>
</div></div></section>'''

def biz_org(key):
    b = BUSINESSES[key]
    return {"@type": "Organization", "name": b["name"], "url": f'{SITE}{b["href"]}', "parentOrganization": ORG_REF}

client_design = [it for it in items("design") if "own brand" not in (it.get("client") or "").lower()]

# ---------- SYNERGY CAPTURE FILMS ----------
# Core offer (confirmed by the business, Oct 2026): photography and videography for events, weddings,
# Kukyala and introduction ceremonies; also portraits, studio and product photography and business video.
# Drone coverage is an optional inclusion in suitable packages, never a standalone service or a guarantee.
# Prices are shown only by the quotation builder at QUOTE, loaded live from the portal's price list
# (portal: /admin/services/capture-films). Do not hard-code prices in these pages.
DRONE_NOTE = ("Drone coverage can be included as an option in suitable photography and videography packages, "
              "where the venue and conditions allow. Ask about it when you request a quote.")

def coverage_options(cta_key, sec_cls="stone"):
    """Photography, videography or both, with drone as an optional extra. No packages or prices are stated."""
    return f'''<section class="sec {sec_cls}" id="coverage"><div class="wrap">
{sec_head("", "Coverage", "Photography, videography or both.", "Coverage, team size and deliverables are agreed with you in the quote.")}
<div class="duo">
<div><p class="lbl">Photography</p><h3>Photographs of the day</h3><p class="prose">Photographers cover the occasion, and you receive edited photographs.</p></div>
<div><p class="lbl">Videography</p><h3>A film of the day</h3><p class="prose">Videographers film the occasion, and you receive an edited film.</p></div>
<div><p class="lbl">Both</p><h3>Photography and video together</h3><p class="prose">One team covering the occasion in photographs and on film.</p></div>
<div><p class="lbl">Optional</p><h3>Drone coverage</h3><p class="prose">{DRONE_NOTE}</p></div>
</div>
<p style="margin-top:40px">{cta_link(cta_key)}</p>
</div></section>'''

FILMS_SERVICES = [
    ("01", "Events", "Corporate events, conferences, celebrations and other occasions, in photographs and on film.",
     "/capture-films/events/", None),
    ("02", "Weddings, Kukyala &amp; Introductions", "Weddings, Kukyala visits and traditional introduction ceremonies such as Kwanjula.",
     "/capture-films/weddings/", item_by_id("wed-brenda-jan") or first("photography", "weddings")),
    ("03", "Portraits, Studio &amp; Product", "Portraits and headshots, studio sessions, and product and brand photography.",
     "/capture-films/photography/", first("photography", "product") or first("photography", "portraits")),
    ("04", "Videography", "Event and ceremony films, business and promotional video, and social media video and Reels.",
     "/capture-films/videography/", None),
]
films_body = f'''
{biz_head("films", "Photography and video for events, weddings and ceremonies.",
  "Synergy Capture Films is the photography and video business of Synergy Concepts Hub in Kampala. We photograph and film events, weddings, Kukyala and introduction ceremonies, and also shoot portraits, products and video for businesses.",
  f'<a class="btn" href="{QUOTE}">Get a Quote</a><a class="link" href="/work/#photography">See our work &rarr;</a>')}
<section class="sec" id="services"><div class="wrap">
{sec_head("", "Services", "What we photograph and film.")}
{img_rows(FILMS_SERVICES)}
<p class="small" style="margin-top:40px">Need regular photos, video and Reels for social media? <a class="link" href="/creative-hub/social-media-content/">Social Media Content &rarr;</a> (produced with Synergy Creative Hub)</p>
</div></section>
<section class="sec stone" id="quotes"><div class="wrap">
{sec_head("", "Quotes", "Every quote starts with the occasion.", "Tell us what you are planning and what you would like covered. We reply within 24 hours with questions or a quote for that coverage.")}
<ol class="steps">
<li><h3>Tell us the occasion</h3><p>An event, a wedding, a Kukyala or an introduction ceremony, or a shoot. Include the date and the location.</p></li>
<li><h3>Choose the coverage</h3><p>Photography, videography or both. Drone coverage can be added to suitable packages where the venue and conditions allow.</p></li>
<li><h3>Receive a quote</h3><p>We confirm the details with you and send a quote for that coverage.</p></li>
</ol>
<!-- The Capture Films quotation builder lives at {QUOTE} (assets/js/quote-builder.js). -->
<div class="actions" style="margin-top:48px"><a class="btn" href="{QUOTE}">Get a Quote</a></div>
</div></section>
{other_businesses("films")}
'''
FILMS_LD = json_ld(
    breadcrumb_ld(("Home", "/"), ("Synergy Capture Films", "/capture-films/")),
    {**biz_org("films"), "@id": f"{SITE}/capture-films/#organization",
     "description": "Photography and video business of Synergy Concepts Hub in Kampala, Uganda: events, weddings, Kukyala and introduction ceremonies, portraits and business video.",
     "areaServed": {"@type": "City", "name": "Kampala"},
     "sameAs": ["https://www.instagram.com/synergycapturefilms_weddings", "https://www.youtube.com/@synergycapturefilms_ug"]},
)
page("/capture-films/", "Synergy Capture Films | Event & Wedding Photography, Kampala",
     "Synergy Capture Films: photography and videography for events, weddings, Kukyala and introduction ceremonies in Kampala, plus portraits and business video.",
     films_body, "/capture-films/", schema=FILMS_LD, og_img=og_from_item("wed-brenda-jan"), biz="films")

# Events
events_body = f'''
<section class="page-head"><div class="wrap">{crumb("films", "Events")}
<h1>Event photography and videography in Kampala.</h1>
<p class="lede">Synergy Capture Films photographs and films corporate events, conferences, celebrations and other occasions, with photography, videography or both.</p>
<div class="actions" style="margin-top:36px"><a class="btn" href="{CTA["events"][1]}">{CTA["events"][0]}</a><a class="link" href="/capture-films/weddings/">Weddings &amp; ceremonies &rarr;</a></div></div></section>
<section class="sec"><div class="wrap">
{svc("events-covered", "01", "Events we cover", "Coverage for business and personal occasions, planned around your programme for the day.",
 ["Corporate events", "Conferences", "Celebrations", "Other occasions"],
 "Organisations recording a conference or corporate event, and families and hosts marking a celebration.")}
</div></section>
{coverage_options("events")}
{cta_band("Planning an event?", CTA["events"][0], CTA["events"][1])}
'''
EVENTS_LD = json_ld(
    breadcrumb_ld(("Home", "/"), ("Synergy Capture Films", "/capture-films/"), ("Events", "/capture-films/events/")),
    {
        "@type": "Service",
        "@id": f"{SITE}/capture-films/events/#service",
        "name": "Event Photography and Videography in Kampala",
        "url": f"{SITE}/capture-films/events/",
        "provider": biz_org("films"),
        "areaServed": {"@type": "City", "name": "Kampala"},
        "serviceType": ["Event Photography", "Event Videography", "Corporate Event Coverage", "Conference Photography and Video"],
    },
)
page("/capture-films/events/", "Event Photography & Videography in Kampala | Synergy Capture Films",
     "Photography and videography for corporate events, conferences, celebrations and other occasions in Kampala by Synergy Capture Films. Request a quote.",
     events_body, "/capture-films/events/", schema=EVENTS_LD, biz="films")

# Portraits, studio and product photography
_jump, _secs = gallery_sections("photography", PHOTO_GROUPS, "photography")
photo_body = f'''
<section class="page-head"><div class="wrap">{crumb("films", "Portraits &amp; Studio")}
<h1>Portrait, studio and product photography in Kampala.</h1>
<p class="lede">Portraits and headshots, studio sessions and product photography by Synergy Capture Films. Select any image to see it larger.</p>
<div class="actions" style="margin-top:36px"><a class="btn" href="{CTA["photography"][1]}">{CTA["photography"][0]}</a><a class="link" href="/capture-films/events/">Events &rarr;</a><a class="link" href="/capture-films/weddings/">Weddings &amp; ceremonies &rarr;</a></div>{_jump}</div></section>
<section class="sec"><div class="wrap">{_secs}</div></section>
{cta_band("Planning a shoot?", CTA["photography"][0], CTA["photography"][1])}
'''
PHOTO_LD = json_ld(
    breadcrumb_ld(("Home", "/"), ("Synergy Capture Films", "/capture-films/"), ("Portraits & Studio", "/capture-films/photography/")),
    {
        "@type": "Service",
        "@id": f"{SITE}/capture-films/photography/#service",
        "name": "Portrait, Studio and Product Photography in Kampala",
        "url": f"{SITE}/capture-films/photography/",
        "provider": biz_org("films"),
        "areaServed": {"@type": "City", "name": "Kampala"},
        "serviceType": ["Corporate Headshots & Portraits", "Studio Photography Sessions", "Product & Brand Photography"],
    },
)
page("/capture-films/photography/", "Portrait & Product Photography in Kampala | Synergy Capture Films",
     "Corporate headshots, professional portraits, studio sessions and product photography in Kampala by Synergy Capture Films, part of Synergy Concepts Hub.",
     photo_body, "/capture-films/photography/", schema=PHOTO_LD, og_img=og_from_item("christine-10"), biz="films")

# Weddings, Kukyala and introduction ceremonies
if not items("photography", "weddings"):
    print("WARNING: no approved wedding images; /capture-films/weddings/ has no gallery")
_jump, _secs = gallery_sections("photography", WEDDING_GROUPS, "weddings")
CEREMONIES = [
    ("weddings", "Weddings", "Wedding ceremonies and receptions."),
    ("kukyala", "Kukyala", "The visit to the bride&rsquo;s family that comes before the introduction."),
    ("introduction", "Introduction ceremonies", "Kwanjula and other traditional introduction ceremonies."),
]
_cer_rows = "".join(
    f'<div class="row row--kind" id="{k}"><span class="n">{n:02d}</span><span class="t">{t}</span>'
    f'<span class="d">{d}<br><a class="link" href="{CTA[k][1]}" style="margin-top:10px">{CTA[k][0]} &rarr;</a></span></div>'
    for n, (k, t, d) in enumerate(CEREMONIES, 1))
wed_body = f'''
<section class="page-head"><div class="wrap">{crumb("films", "Weddings &amp; Ceremonies")}
<h1>Wedding, Kukyala and introduction photography and video.</h1>
<p class="lede">Synergy Capture Films photographs and films weddings, Kukyala visits and traditional introduction ceremonies, with photography, videography or both.</p>
<div class="actions" style="margin-top:36px"><a class="btn" href="{CTA["weddings"][1]}">{CTA["weddings"][0]}</a><a class="link" href="#gallery">See wedding and ceremony work &darr;</a></div></div></section>
<section class="sec" id="ceremonies"><div class="wrap">
{sec_head("", "Ceremonies", "Weddings and the ceremonies before them.")}
<div class="rows rows--sm">{_cer_rows}</div>
</div></section>
{coverage_options("weddings")}
<section class="sec" id="gallery"><div class="wrap">{_jump}{_secs}</div></section>
{cta_band("Planning a wedding or ceremony?", CTA["weddings"][0], CTA["weddings"][1])}
'''
WED_LD = json_ld(
    breadcrumb_ld(("Home", "/"), ("Synergy Capture Films", "/capture-films/"), ("Weddings & Ceremonies", "/capture-films/weddings/")),
    {
        "@type": "Service",
        "@id": f"{SITE}/capture-films/weddings/#service",
        "name": "Wedding, Kukyala and Introduction Ceremony Photography and Videography in Kampala",
        "url": f"{SITE}/capture-films/weddings/",
        "provider": biz_org("films"),
        "areaServed": {"@type": "City", "name": "Kampala"},
        "serviceType": ["Wedding Photography", "Wedding Videography", "Kukyala Photography and Video",
                        "Introduction Ceremony (Kwanjula) Photography and Video"],
    },
)
page("/capture-films/weddings/", "Wedding, Kukyala & Introduction Coverage | Synergy Capture Films",
     "Photography and videography for weddings, Kukyala and introduction ceremonies (Kwanjula) in Kampala by Synergy Capture Films. See the work and request a quote.",
     wed_body, "/capture-films/weddings/", schema=WED_LD, og_img=og_from_item("wed-brenda-jan"), biz="films")

# Videography (service page; films are published on the YouTube channel, not on this site)
YOUTUBE = "https://www.youtube.com/@synergycapturefilms_ug"
video_body = f'''
<section class="page-head"><div class="wrap">{crumb("films", "Videography")}
<h1>Event, ceremony and business video.</h1>
<p class="lede">Synergy Capture Films films events, weddings and ceremonies, and produces video for businesses: promotional films, campaign content, social media video and Reels, and corporate communication.</p>
<div class="actions" style="margin-top:36px"><a class="btn" href="{CTA["video"][1]}">{CTA["video"][0]}</a>{ext_link("Watch on YouTube", YOUTUBE, "link")}</div></div></section>
<section class="sec"><div class="wrap">
{svc("video-services", "01", "What we film", "Video planned around what it needs to do: record an occasion, promote, launch or explain.",
 ["Events, weddings, Kukyala and introduction ceremonies", "Business and promotional video", "Campaign and product launch video",
  "Social media video and Reels", "Corporate communication and internal video", "Behind-the-scenes and highlights"],
 "Hosts and families recording an occasion, businesses launching a product or campaign, and teams that need video for social media or internal communication.",
 f'<p class="prose">{DRONE_NOTE}</p><p class="prose" style="margin-top:16px">{ext_link("Synergy Capture Films on YouTube", YOUTUBE, "link")}</p>')}
</div></section>
<section class="sec stone"><div class="wrap">
{sec_head("", "Related", "Video alongside other work.")}
<div class="duo">
<div><p class="lbl">Synergy Capture Films</p><h3>Events and ceremonies</h3><p class="prose">Photography and video for events, weddings, Kukyala and introduction ceremonies.</p><p><a class="link" href="/capture-films/events/">Events &rarr;</a> &nbsp; <a class="link" href="/capture-films/weddings/">Weddings &amp; ceremonies &rarr;</a></p></div>
<div><p class="lbl">With Synergy Creative Hub</p><h3>Monthly social media content</h3><p class="prose">Short-form video, photos and graphics for your channels, planned and produced each month.</p><p><a class="link" href="/creative-hub/social-media-content/">Social Media Content &rarr;</a></p></div>
</div></div></section>
{cta_band("Need a video made?", CTA["video"][0], CTA["video"][1])}
'''
VIDEO_LD = json_ld(
    breadcrumb_ld(("Home", "/"), ("Synergy Capture Films", "/capture-films/"), ("Videography", "/capture-films/videography/")),
    {
        "@type": "Service",
        "@id": f"{SITE}/capture-films/videography/#service",
        "name": "Event, Ceremony and Business Video Production in Kampala",
        "url": f"{SITE}/capture-films/videography/",
        "provider": biz_org("films"),
        "areaServed": {"@type": "City", "name": "Kampala"},
        "serviceType": ["Event & Ceremony Videography", "Business & Promotional Video", "Social Media Video & Reels",
                        "Corporate Communication Video"],
    },
)
page("/capture-films/videography/", "Event & Business Videography in Kampala | Synergy Capture Films",
     "Videography for events, weddings, Kukyala and introduction ceremonies, plus promotional, social media and corporate video in Kampala by Synergy Capture Films.",
     video_body, "/capture-films/videography/", schema=VIDEO_LD, biz="films")

# Quote request: the Capture Films quotation builder (assets/js/quote-builder.js) plus the simple form.
# The builder loads the price list from the portal (/api/quote/catalog) and stays hidden if it cannot;
# the simple enquiry form below always works. Both post to the portal's /api/quote.
_guide = ["The occasion: an event, a wedding, a Kukyala or an introduction ceremony, a portrait or product shoot, or business video",
          "The date, or how flexible it is, and the location",
          "What you would like covered: photography, videography or both, and roughly for how long",
          "Whether you would like drone coverage considered (available in suitable packages, where the venue and conditions allow)",
          "What you need at the end: edited photographs, a film, or both"]
quote_body = f'''
<section class="page-head"><div class="wrap">{crumb("films", "Get a Quote")}
<h1>Request a quote from Synergy Capture Films.</h1>
<p class="lede">Tell us about the occasion. We reply within 24 hours with questions or a quotation.</p></div></section>
<section class="sec" id="builder" hidden data-api="{PORTAL}"><div class="wrap">
<div class="qb-intro"><p class="eyebrow">Quotation builder</p>
<p class="prose">Choose your event, the services and any extras to see an itemised estimate, then send it to our team. This is a quotation request: nothing is booked or charged.</p></div>
<div id="qb"></div>
<p style="margin-top:48px"><button type="button" class="link" id="simple-toggle" hidden aria-expanded="false" aria-controls="enquiry-form">Prefer to describe it in your own words? Use the simple form</button></p>
</div></section>
<section class="sec" id="enquiry-form"><div class="wrap"><div class="contact">
<div class="info"><div><h2 class="h3" style="margin-bottom:20px">What to tell us</h2>{plain(_guide)}</div>
{CONTACT_DL}</div>
<div class="form">{form_html(["films"], BUSINESSES["films"]["name"])}</div>
</div></div></section>
'''
QUOTE_LD = json_ld(
    breadcrumb_ld(("Home", "/"), ("Synergy Capture Films", "/capture-films/"), ("Get a Quote", QUOTE)),
    {"@type": "ContactPage", "@id": f"{SITE}{QUOTE}#webpage", "name": "Request a quote from Synergy Capture Films",
     "url": f"{SITE}{QUOTE}", "about": biz_org("films")},
)
page(QUOTE, "Request a Photography or Video Quote | Synergy Capture Films",
     "Request a photography or videography quote from Synergy Capture Films for an event, wedding, Kukyala, introduction ceremony, portrait shoot or business video.",
     quote_body, QUOTE, schema=QUOTE_LD, biz="films", extra_js=(("quote-builder", "qb"),))

# ---------- SYNERGY CREATIVE HUB ----------
creative_body = f'''
{biz_head("creative", "Brand identity, design and content for businesses.",
  "Synergy Creative Hub is the design and creative production business of Synergy Concepts Hub: logos and brand identity, company profiles, promotional design, social media content and campaign production.",
  f'<a class="btn" href="{BRIEF}">Send a Brief</a><a class="link" href="/creative-hub/design/">See design work &rarr;</a>')}
<section class="sec" id="services"><div class="wrap">
<nav class="jump" aria-label="Creative Hub services" style="margin:0 0 56px"><a href="#graphic-design">Graphic Design &amp; Branding</a><a href="#social-media-content">Social Media Content</a><a href="#campaign-content-production">Campaign &amp; Content Production</a></nav>
{creative_svc("graphic-design", "01", "Graphic Design &amp; Branding", "",
  "Branding and materials that make a business look established and consistent.",
  ["Logos and brand identity", "Company profiles and presentations", "Marketing materials and flyers", "Corporate communication and reports", "Social media graphics"],
  "Businesses launching or refreshing a brand, and teams that need documents and promotional material to match it.",
  svc_pics(client_design, "/creative-hub/design/"),
  '<a class="link" href="/creative-hub/design/">See design work &rarr;</a>' + cta_link("design"))}
{creative_svc("social-media-content", "02", "Social Media Content", "",
  "Business photography, video and short-form content for the platforms your customers use, produced in one session a month.",
  ["Business photography", "Business video", "Short-form content for Reels, Shorts and TikTok", "Product and content shoots", "Visual content sized for each platform"],
  "Businesses that want a steady supply of their own photos and videos rather than stock images. Account management is a separate service.",
  svc_pics(items("design", "social"), "/creative-hub/social-media-content/"),
  '<a class="link" href="/creative-hub/social-media-content/">How it works &rarr;</a>' + cta_link("social"))}
{creative_svc("campaign-content-production", "03", "Campaign &amp; Content Production", "",
  "Content for launches, promotions and corporate communication, planned and produced as one piece of work.",
  ["Campaign photography and video", "Product launch content", "Corporate communication and internal video", "Promotional films", "Behind-the-scenes and highlights"],
  "Launches, promotions and announcements that need photography, video and design produced together.",
  "", cta_link("campaign"))}
<p class="small" style="margin-top:48px">Looking for photography or video on its own? <a class="link" href="/capture-films/">Synergy Capture Films &rarr;</a></p>
</div></section>
{cta_band("Need design or content for your business?", "Send a Brief", BRIEF)}
{other_businesses("creative")}
'''
CREATIVE_LD = json_ld(
    breadcrumb_ld(("Home", "/"), ("Synergy Creative Hub", "/creative-hub/")),
    {**biz_org("creative"), "@id": f"{SITE}/creative-hub/#organization",
     "description": "Graphic design, brand identity, social media content and campaign production business of Synergy Concepts Hub in Kampala, Uganda.",
     "areaServed": {"@type": "City", "name": "Kampala"}},
    {
        "@type": "Service",
        "@id": f"{SITE}/creative-hub/#service",
        "name": "Graphic Design, Brand Identity, Social Media Content and Campaign Production",
        "url": f"{SITE}/creative-hub/",
        "provider": {"@id": f"{SITE}/creative-hub/#organization"},
        "areaServed": {"@type": "City", "name": "Kampala"},
        "serviceType": ["Graphic Design & Brand Identity", "Social Media Content Production", "Campaign & Content Production"],
    },
)
page("/creative-hub/", "Synergy Creative Hub | Design, Branding & Content in Kampala",
     "Synergy Creative Hub: logo and brand identity design, company profiles, promotional design, social media content and campaign production in Kampala.",
     creative_body, "/creative-hub/", schema=CREATIVE_LD, og_img=og_from_item("matsen-01"), biz="creative")

# Design & branding
_jump, _secs = gallery_sections("design", DESIGN_GROUPS, "design")
design_body = f'''
<section class="page-head"><div class="wrap">{crumb("creative", "Design &amp; Branding")}
<h1>Graphic design, brand identity and company profiles.</h1>
<p class="lede">Logos, company profiles and promotional design by Synergy Creative Hub. Work for clients is credited to the client; Synergy&rsquo;s own brands are labelled as such. Select any design to see it larger.</p>
<div class="actions" style="margin-top:36px"><a class="btn" href="{CTA["design"][1]}">{CTA["design"][0]}</a></div>{_jump}</div></section>
<section class="sec"><div class="wrap">{_secs}</div></section>
{cta_band("Need a brand or a document designed?", CTA["design"][0], CTA["design"][1])}
'''
DESIGN_LD = json_ld(
    breadcrumb_ld(("Home", "/"), ("Synergy Creative Hub", "/creative-hub/"), ("Design & Branding", "/creative-hub/design/")),
    {
        "@type": "Service",
        "@id": f"{SITE}/creative-hub/design/#service",
        "name": "Graphic Design, Logo Design, Brand Identity and Company Profiles in Kampala",
        "url": f"{SITE}/creative-hub/design/",
        "provider": biz_org("creative"),
        "areaServed": {"@type": "City", "name": "Kampala"},
        "serviceType": [
            "Logo Design & Brand Identity",
            "Company Profiles & Presentation Design",
            "Social Media & Promotional Graphics",
            "Corporate Stationery & Collateral",
        ],
    },
)
page("/creative-hub/design/", "Graphic Design and Branding in Kampala | Synergy Creative Hub",
     "Logo design, brand identity, company profiles, presentations and promotional design in Kampala by Synergy Creative Hub, part of Synergy Concepts Hub.",
     design_body, "/creative-hub/design/", schema=DESIGN_LD, og_img=og_from_item("matsen-01"), biz="creative")

# Social media content
_social = items("design", "social")
_social_examples = f'''<section class="sec stone" id="examples"><div class="wrap">
{sec_head("", "Examples", "Graphics made for social media.")}
{gallery(_social, "c3", "social")}
</div></section>''' if _social else ""
_split_pic = first("photography", "product")
sm_body = f'''
<section class="page-head"><div class="wrap">{crumb("creative", "Social Media Content")}
<h1>Monthly social media content production for businesses.</h1>
<p class="lede">We plan, shoot and edit the photos, videos and graphics your business needs for social media in one monthly recording session. You post them when it suits you.</p>
<p class="small" style="margin-top:20px">A shared service: Synergy Creative Hub designs the graphics, carousels and branded templates; <a class="link" href="/capture-films/videography/">Synergy Capture Films</a> shoots the photos, video and Reels.</p>
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
    breadcrumb_ld(("Home", "/"), ("Synergy Creative Hub", "/creative-hub/"), ("Social Media Content", "/creative-hub/social-media-content/")),
    {
        "@type": "Service",
        "@id": f"{SITE}/creative-hub/social-media-content/#service",
        "name": "Social Media Content Production for Businesses in Kampala",
        "url": f"{SITE}/creative-hub/social-media-content/",
        "provider": biz_org("creative"),
        "areaServed": {"@type": "City", "name": "Kampala"},
        "serviceType": [
            "Monthly Social Media Content Production",
            "Short-Form Video Production (Reels, Shorts, TikTok)",
            "Social Media Graphic Design",
            "Social Media Account Management",
        ],
    },
)
page("/creative-hub/social-media-content/", "Social Media Content Production in Kampala | Synergy Creative Hub",
     "Business photography, short-form video and graphic design for social media, planned and recorded in one monthly session in Kampala, Uganda.",
     sm_body, "/creative-hub/social-media-content/", schema=SOCIAL_LD, og_img=og_from_item("flyer-watches-2"), biz="creative")

# Brief
brief_body = enquiry_body("creative", "Send a Brief", "Send a brief to Synergy Creative Hub.",
    "Tell us what you need designed or produced. A short description is enough: we reply within 24 hours with questions or a quote.",
    ["What you need: a logo or brand identity, a company profile, promotional design, social media content or a campaign",
     "Where it will be used: print, social media, presentations or your website",
     "Your deadline, if you have one",
     "Any brand material you already have, such as a logo, colours or earlier documents"],
    ["creative"])
BRIEF_LD = json_ld(
    breadcrumb_ld(("Home", "/"), ("Synergy Creative Hub", "/creative-hub/"), ("Send a Brief", BRIEF)),
    {"@type": "ContactPage", "@id": f"{SITE}{BRIEF}#webpage", "name": "Send a brief to Synergy Creative Hub",
     "url": f"{SITE}{BRIEF}", "about": biz_org("creative")},
)
page(BRIEF, "Send a Design or Content Brief | Synergy Creative Hub",
     "Send a brief to Synergy Creative Hub for brand identity, company profiles, promotional design, social media content or campaign production in Kampala.",
     brief_body, BRIEF, schema=BRIEF_LD, biz="creative")

# ---------- SYNERGY MULTIMEDIA ACADEMY ----------
# The Academy's courses, intakes, admissions and applications live on its own website (SMA). This page
# introduces the Academy within the group and refers visitors to that site. It never collects applications,
# shows fees or reproduces the Academy's admissions workflow.
# Destinations verified by rendering each page on 21 Oct 2026. The Academy site shows its homepage for any
# unknown path, so only these verified paths may be linked. Intake dates and masterclass speakers are NOT
# copied here: they change, and this page is only rebuilt by hand. The linked pages always show the current ones.
SMA_PAGES = {
    "programs": SMA + "programs",          # programme catalogue: regular, holiday, bootcamp, corporate
    "intake": SMA + "intake",              # admissions: open intakes and application links
    "masterclass": SMA + "masterclass",    # monthly masterclass (The Creative Talk Series)
    "project-lab": SMA + "project-lab",    # Project Lab
    "holiday": SMA + "holiday-programs",   # holiday programmes
}
ACADEMY_HIGHLIGHTS = [
    ("Courses &amp; intakes", "Courses and upcoming intakes",
     "Practical programmes in photography, video production, graphic design, animation, social media, UI/UX design and AI for creatives. Intakes open during the year: the Academy&rsquo;s admissions page shows which are open now and when applications close.",
     [("Browse programmes", "programs"), ("See open intakes and apply", "intake")]),
    ("Masterclasses", "The SMA Monthly Masterclass",
     "A monthly talk series, The Creative Talk Series, where Uganda&rsquo;s creatives, entrepreneurs and innovators share their experience with the next generation. The Academy announces each session&rsquo;s date and speaker.",
     [("About the masterclass", "masterclass")]),
    ("Project Lab", "Project Lab",
     "Practical projects with mentorship, for turning skills into professional, portfolio-ready work. Courses teach the skills; Project Lab puts them to work.",
     [("Explore Project Lab", "project-lab")]),
    ("Holiday &amp; other programmes", "Holiday programmes, bootcamps and corporate training",
     "Short practical programmes for students and beginners during the school holidays, plus bootcamps and corporate training listed in the programme catalogue.",
     [("Holiday programmes", "holiday"), ("All programmes", "programs")]),
]

def academy_highlights():
    out = ""
    for lbl, title, text, links in ACADEMY_HIGHLIGHTS:
        ls = " &nbsp; ".join(ext_link(l, SMA_PAGES[k], "link") for l, k in links)
        out += f'<div><p class="lbl">{lbl}</p><h3>{title}</h3><p class="prose">{text}</p><p>{ls}</p></div>'
    return f'<div class="duo">{out}</div>'

academy_body = f'''
{biz_head("academy", "Practical courses in creative and digital media.",
  "Synergy Multimedia Academy is the education business of Synergy Concepts Hub: practical courses, holiday programmes, masterclasses and project-based learning for the next generation of creators. Courses, intakes and applications are on the Academy&rsquo;s own website.",
  ext_link("Visit the Academy website", SMA, "btn") + '<a class="link" href="#highlights">Highlights &darr;</a>')}
<section class="sec" id="highlights"><div class="wrap">
{sec_head("", "Highlights", "Courses, masterclasses, projects and programmes.", "Full details, fees and registration are on the Academy website.")}
{academy_highlights()}
</div></section>
<section class="sec stone" id="teaches"><div class="wrap"><div class="split">
<div class="pic">{static_img("sma-learning.jpg", 1400, 933, "A student editing photos on a laptop at Synergy Multimedia Academy")}</div>
<div class="txt"><p class="eyebrow">What the Academy teaches</p><h2>Photography, film, design and more.</h2>
{plain(["Photography", "Video production", "Graphic design", "Animation", "Social media", "UI/UX design", "AI for creatives"])}
<p class="small">Built by Synergy Concepts Hub, <a class="link" href="/products/#sma-sync">SMA Sync</a> is media synchronization software used by the Academy.</p>
</div></div></div></section>
{other_businesses("academy")}
'''
ACADEMY_LD = json_ld(
    breadcrumb_ld(("Home", "/"), ("Synergy Multimedia Academy", "/academy/")),
    {"@type": "EducationalOrganization", "@id": f"{SITE}/academy/#organization", "name": "Synergy Multimedia Academy",
     "url": SMA, "parentOrganization": ORG_REF,
     "description": "Education business of Synergy Concepts Hub offering practical courses, holiday programmes, masterclasses and Project Lab."},
)
page("/academy/", "Synergy Multimedia Academy | Creative & Digital Media Training",
     "Synergy Multimedia Academy, part of Synergy Concepts Hub: practical courses and intakes, monthly masterclasses, Project Lab and holiday programmes in Kampala.",
     academy_body, "/academy/", schema=ACADEMY_LD, og_img=(f"{IMG}sma-learning.jpg", 1400, 933, "A student editing photos on a laptop at Synergy Multimedia Academy"), biz="academy")

# ---------- PRODUCTS ----------
prod_body = f'''
<section class="page-head"><div class="wrap"><p class="eyebrow">Synergy Concepts Hub &middot; Products</p>
<h1>Software products built by Synergy Concepts Hub.</h1>
<p class="lede">Alongside client systems and creative work, Synergy Concepts Hub develops and maintains its own software products in Kampala, Uganda.</p></div></section>
<section class="sec"><div class="wrap">
<div class="cards">
<div class="card" id="quickcredit"><span class="k">In use &middot; Financial systems</span><h2 class="h3">QuickCredit</h2><p>Enterprise lending and credit management platform built for lending operations, combining borrower workflows, mobile money integration, credit scoring and real-time analytics.</p><p class="small"><a class="link" href="https://quickcreditclientportal.netlify.app/home" target="_blank" rel="noopener">View QuickCredit platform &#8599;</a></p></div>
<div class="card" id="sma-sync"><span class="k">In use &middot; Media workflows</span><h2 class="h3">SMA Sync</h2><p>Offline-first media synchronization software designed for creative production and training workflows where reliable local file synchronization is essential.</p><p class="small">Built by Synergy Concepts Hub. Used by <a class="link" href="/academy/">Synergy Multimedia Academy</a>. <!-- Internal product: do not add download, purchase, pricing or sign-up links unless Synergy decides to release it publicly. --></p></div>
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
     prod_body, "/products/", schema=PRODUCTS_LD, biz="sch")

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

def work_block(category, title, business, page_href, cta_key, limit=6):
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
<div class="wblock-head"><h2 class="wsub">{title} &middot; {business}</h2><p class="wlinks"><a class="link" href="{page_href}">All {title.lower()} &rarr;</a>{cta_link(cta_key)}</p></div>
{gallery(sel, "c3", "work-" + category)}</div>'''

_work_creative = work_block("photography", "Photography", "Synergy Capture Films", "/capture-films/photography/", "photography") + \
                 work_block("design", "Design", "Synergy Creative Hub", "/creative-hub/design/", "design")

_FILTERS = [("all", "All"), ("photography", "Photography"), ("design", "Design"),
            ("technology", "Technology"), ("websites", "Websites"), ("video", "Video")]
import re
_cats_present = {c for m in re.findall(r'data-cat="([^"]+)"', _work_creative + tech_rows) for c in m.split()}
filter_btns = "".join(
    f'<button data-filter="{k}" aria-pressed="{"true" if k == "all" else "false"}">{label}</button>'
    for k, label in _FILTERS if k == "all" or k in _cats_present)

work_body = f'''
<section class="page-head"><div class="wrap"><p class="eyebrow">Work</p>
<h1>Selected photography, design, systems and websites.</h1>
<p class="lede">Work across the Synergy businesses: photography by Synergy Capture Films, design by Synergy Creative Hub, and systems and websites by Synergy Concepts Hub, for businesses in Uganda and across East Africa.</p></div></section>
<section class="sec dark"><div class="wrap">
<div class="filters" role="group" aria-label="Filter work">{filter_btns}</div>
<div data-group id="creative">{_work_creative}</div>
<div data-group id="technology" style="margin-top:72px"><h2 class="wsub">Technology and websites &middot; Synergy Concepts Hub</h2><div class="rows" id="websites">{tech_rows}</div></div>
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
{sec_head("", "Structure", "One parent company, four Synergy businesses.")}
<div class="rows">
<a class="row" href="/technology/"><span class="n">01</span><span class="t">Synergy Concepts Hub</span><span class="d">The parent company, and the home of our business technology and proprietary software products such as QuickCredit and SMA Sync.</span><span class="a" aria-hidden="true">&rarr;</span></a>
<a class="row" href="/capture-films/"><span class="n">02</span><span class="t">Synergy Capture Films</span><span class="d">Our photography and video business: corporate portraits, studio sessions, product photography, weddings and ceremonies, and business video.</span><span class="a" aria-hidden="true">&rarr;</span></a>
<a class="row" href="/creative-hub/"><span class="n">03</span><span class="t">Synergy Creative Hub</span><span class="d">Our design and creative production business: logos, brand identity, company profiles, promotional design, social media content and campaigns.</span><span class="a" aria-hidden="true">&rarr;</span></a>
<a class="row" href="/academy/"><span class="n">04</span><span class="t">Synergy Multimedia Academy</span><span class="d">Our education business, offering practical courses, holiday programs and multimedia training. Admissions run on the Academy&rsquo;s own website.</span><span class="a" aria-hidden="true">&rarr;</span></a>
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
<p class="lede">Tell us what you need across business software, websites, photography, video, graphic design or social media content. Choose the service and we pass it to the right Synergy business. A short description is enough and we reply within 24 hours.</p></div></section>
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
urls = ["/", "/technology/", "/products/",
        "/capture-films/", "/capture-films/events/", "/capture-films/weddings/", "/capture-films/photography/", "/capture-films/videography/", QUOTE,
        "/creative-hub/", "/creative-hub/design/", "/creative-hub/social-media-content/", BRIEF,
        "/academy/", "/work/"] + CASE_URLS + ["/about/", "/contact/"]
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
# Permanent redirects for pages that moved into a business section (Oct 2026). Each old URL goes straight
# to its final page (no chains). Both the trailing-slash and bare forms are listed.
REDIRECTS = [
    ("/social-media-management.html", "/creative-hub/social-media-content/"),
    ("/social-media-management", "/creative-hub/social-media-content/"),
    ("/creative/photography/", "/capture-films/photography/"),
    ("/creative/photography", "/capture-films/photography/"),
    ("/creative/design/", "/creative-hub/design/"),
    ("/creative/design", "/creative-hub/design/"),
    ("/creative/social-media-content/", "/creative-hub/social-media-content/"),
    ("/creative/social-media-content", "/creative-hub/social-media-content/"),
    ("/creative/", "/creative-hub/"),
    ("/creative", "/creative-hub/"),
]
assert not ({src for src, _ in REDIRECTS} & set(urls)), "a redirect source is also a live page"
assert all(dst in urls for _, dst in REDIRECTS), "a redirect points at a page that is not built"
_redir_out = "".join(f"{src} {dst} 301\n" for src, dst in REDIRECTS)
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
