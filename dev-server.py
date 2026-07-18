#!/usr/bin/env python3
"""Zero-dependency hot-reload dev server for the brand guide.

Serves the current directory and injects a small poller into any .html
response. The poller hits /__mtime; when the watched file's mtime changes,
the page reloads. Run: python3 dev-server.py [port]
"""
import http.server
import os
import sys
import json

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8752
ROOT = os.path.dirname(os.path.abspath(__file__))

RELOAD_SNIPPET = b"""
<script>
(function () {
  var last = null;
  async function tick() {
    try {
      var r = await fetch('/__mtime', { cache: 'no-store' });
      var m = (await r.json()).mtime;
      if (last !== null && m !== last) { location.reload(); return; }
      last = m;
    } catch (e) {}
    setTimeout(tick, 500);
  }
  tick();
})();
</script>
"""


def latest_mtime():
    newest = 0.0
    for name in os.listdir(ROOT):
        if name.endswith((".html", ".css", ".js")):
            try:
                newest = max(newest, os.path.getmtime(os.path.join(ROOT, name)))
            except OSError:
                pass
    return newest


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def log_message(self, *a):
        pass  # quiet

    def do_GET(self):
        if self.path == "/__mtime":
            body = json.dumps({"mtime": latest_mtime()}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        path = self.translate_path(self.path)
        if path.endswith(".html") and os.path.isfile(path):
            with open(path, "rb") as f:
                data = f.read()
            if b"</body>" in data:
                data = data.replace(b"</body>", RELOAD_SNIPPET + b"</body>", 1)
            else:
                data = data + RELOAD_SNIPPET
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return

        return super().do_GET()


if __name__ == "__main__":
    os.chdir(ROOT)
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"hot-reload dev server on http://localhost:{PORT}/oio-apex-brand-guide.html")
    httpd.serve_forever()
