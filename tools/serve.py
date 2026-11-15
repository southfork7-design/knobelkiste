# Testserver für die Knobelkiste: wie `python -m http.server`, aber der Browser soll
# jede Datei bei jedem Abruf neu prüfen. Sonst zeigt Chrome auf dem Handy nach
# Änderungen noch eine Weile die alte Fassung aus seinem Zwischenspeicher.
# Aufruf im Projektordner: python tools/serve.py 8123
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    root = Path(__file__).resolve().parent.parent
    handler = partial(NoCacheHandler, directory=str(root))
    # 0.0.0.0: auch vom Handy im selben WLAN erreichbar
    with ThreadingHTTPServer(('0.0.0.0', port), handler) as httpd:
        print(f'Knobelkiste läuft auf http://localhost:{port}', flush=True)
        httpd.serve_forever()
