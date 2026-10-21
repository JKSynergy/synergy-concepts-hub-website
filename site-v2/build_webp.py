#!/usr/bin/env python3
"""Write a WebP copy next to every JPEG under assets/img/ (and the review preview's images).

Run:  python build_webp.py        (needs Pillow; build_images.py runs this automatically)

The JPEGs stay: they are the fallback for old browsers, the full-size links crawlers follow,
and the social-share (og:image) files, which some platforms do not read as WebP.
build.py serves the WebP through <picture> wherever a copy exists. A copy is only rewritten
when its JPEG is newer, so reruns are fast.
"""
import os, sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required: pip install Pillow")

HERE = os.path.dirname(os.path.abspath(__file__))
DIRS = [os.path.join(HERE, "assets", "img"),
        os.path.join(HERE, "_review", "preview", "assets", "img")]
QUALITY = 80


def main():
    made = before = after = 0
    for top in DIRS:
        if not os.path.isdir(top):
            continue
        for d, _, names in os.walk(top):
            for n in names:
                if not n.lower().endswith((".jpg", ".jpeg")):
                    continue
                src = os.path.join(d, n)
                dst = os.path.splitext(src)[0] + ".webp"
                if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
                    continue
                with Image.open(src) as im:
                    im.convert("RGB").save(dst, "WEBP", quality=QUALITY, method=6)
                made += 1
                before += os.path.getsize(src)
                after += os.path.getsize(dst)
    if made:
        print(f"webp: {made} written, {before / 1048576:.1f} MB of JPEG -> {after / 1048576:.1f} MB of WebP")
    else:
        print("webp: all copies up to date")


if __name__ == "__main__":
    main()
