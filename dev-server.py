#!/usr/bin/env python3
"""Local dev/test server with HTTP caching disabled.

The default `python3 -m http.server` lets the browser cache JS/CSS/HTML, which
during this project repeatedly caused a stale script + fresh HTML mismatch that
looked like "all data disappeared". Serving with no-cache headers makes every
edit load fresh, so testers never chase phantom cache bugs.
"""
import os
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5500
    # Always serve the directory this script lives in (the project root)
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    httpd = HTTPServer(("", port), NoCacheHandler)
    print(f"  (no-cache) serving on port {port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        httpd.server_close()


if __name__ == "__main__":
    main()
