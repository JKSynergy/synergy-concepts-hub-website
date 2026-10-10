#!/usr/bin/env python3
"""Serve the site locally so root-relative paths (/assets/..., /work/) resolve.

The pages use root-relative URLs, exactly as on Cloudflare Pages. Opened directly from disk
(file://), the browser resolves "/assets/css/sch.css" to the root of the drive, so styles,
images and links break. Serve the folder over HTTP instead:

    python preview.py              review preview (_review/preview/, includes PENDING items)
    python preview.py --public     the public build (site-v2/ itself, approved items only)
    python preview.py --port 8080  choose another port

Then open the printed address. Local only: binds to 127.0.0.1. Press Ctrl+C to stop.
"""
import argparse, functools, http.server, os, socketserver, sys

HERE = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def send_error(self, code, message=None, explain=None):
        # Mirror Cloudflare Pages: unknown paths return the site's 404.html.
        page = os.path.join(self.directory, "404.html")
        if code == 404 and os.path.exists(page):
            with open(page, "rb") as f:
                body = f.read()
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)
            return
        super().send_error(code, message, explain)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--public", action="store_true", help="serve the public build instead of the review preview")
    ap.add_argument("--port", type=int, default=8000)
    a = ap.parse_args()
    root = HERE if a.public else os.path.join(HERE, "_review", "preview")
    if not os.path.exists(os.path.join(root, "index.html")):
        sys.exit(f"No site found in {root}. Run: python build.py" + ("" if a.public else " --preview"))
    handler = functools.partial(Handler, directory=root)
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("127.0.0.1", a.port), handler) as httpd:
        label = "public build" if a.public else "REVIEW PREVIEW (pending items shown)"
        print(f"Serving {label} from {root}\nOpen http://localhost:{a.port}/   (Ctrl+C to stop)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
