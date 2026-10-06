#!/usr/bin/env python3
"""本地预览服务：与 deploy.sh 相同的 __VERSION__ 替换逻辑，静态托管 plane_war。"""
import http.server
import socketserver
import functools
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PORT = 8777
VER = "dev0"


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path in ("/", "/index.html"):
            html = (ROOT / "index.html").read_text(encoding="utf-8")
            # 本地无版本化副本（部署才生成 x.v版本.js），入口直接回源文件
            html = html.replace("js/game.v__VERSION__.js", "js/game.js")
            body = html.replace("__VERSION__", VER).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def log_message(self, fmt, *args):
        pass  # 静默，避免刷屏


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
        print(f"serving {ROOT} on http://127.0.0.1:{PORT}")
        httpd.serve_forever()
