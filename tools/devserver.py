#!/usr/bin/env python3
"""開發用靜態伺服器：關閉瀏覽器快取，改檔後重新整理即生效。用法：python3 tools/devserver.py [port]"""
import http.server, sys

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 128  # 預設 5：資料檔同時請求多時會 connection reset

Server(("", port), NoCache).serve_forever()
