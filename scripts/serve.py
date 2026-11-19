#!/usr/bin/env python3
"""Serve the workspace while exposing a selected deployment configuration."""

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("config", type=Path)
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    repository = Path(__file__).resolve().parent.parent
    workspace = repository.parent
    config = args.config.resolve()
    config.read_text(encoding="utf-8")
    config_route = f"/{repository.name}/app/site.config.json"

    class Handler(SimpleHTTPRequestHandler):
        def do_GET(self) -> None:
            request_path = self.path.partition("?")[0]
            if request_path == config_route:
                content = config.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(content)))
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()
                self.wfile.write(content)
                return
            super().do_GET()

    handler = partial(Handler, directory=workspace)
    url = f"http://127.0.0.1:{args.port}/{repository.name}/app/"
    print(f"Using configuration: {config}")
    print(f"Open {url}")
    ThreadingHTTPServer(("127.0.0.1", args.port), handler).serve_forever()


if __name__ == "__main__":
    main()
