#!/usr/bin/env python3
"""mTLS client-certificate authentication server for forms-as-code.

Port 8443 serves the app. Port 8444 requests a client certificate and exposes
/api/whoami. The browser uses that identity for an authentication acknowledgment;
form content is not cryptographically signed or stored by this server.
"""

import argparse
import hashlib
import json
import os
import ssl
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

HERE = Path(__file__).resolve().parent
PAGE_PORT = 8443
API_PORT = 8444
PAGE_ORIGIN = f"https://localhost:{PAGE_PORT}"
APP_PATH = "/forms-as-code/app/"
AUTH_SCRIPT_PATH = "/certificate/certificate-sign.js"

CERTS = HERE / "certs"
FORMS_AS_CODE = None
STATIC_MOUNTS = {}


def certificate_path(filename):
    return CERTS / filename


def find_forms_as_code(explicit_path=None):
    """Locate the forms-as-code repository."""
    candidates = [Path(explicit_path)] if explicit_path else [HERE.parent, HERE.parent / "forms-as-code"]
    for candidate in candidates:
        if (candidate / "app" / "app.js").is_file():
            return candidate.resolve()
    return None


def inject_authentication_script(html):
    tag = f'<script defer src="{AUTH_SCRIPT_PATH}"></script>\n</head>'.encode()
    if b"</head>" not in html:
        raise RuntimeError("forms-as-code app/index.html has no </head>; cannot add the authentication script")
    return html.replace(b"</head>", tag, 1)


class BaseHandler(BaseHTTPRequestHandler):
    def _send_response(self, status, body, content_type, extra_headers=None):
        self.send_response(status)
        self._send_cors_headers()
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        for header_name, header_value in (extra_headers or {}).items():
            self.send_header(header_name, header_value)
        self.end_headers()
        self.wfile.write(body)

    def _send_json_response(self, status, obj):
        self._send_response(status, json.dumps(obj).encode(), "application/json")

    def _send_cors_headers(self):
        pass


# Only web file types are served from the forms-as-code and forms folders.
STATIC_TYPES = {
    ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".json": "application/json",
    ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".gif": "image/gif", ".ico": "image/x-icon", ".webp": "image/webp",
    ".woff": "font/woff", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
    ".md": "text/plain; charset=utf-8", ".csv": "text/csv; charset=utf-8", ".pdf": "application/pdf",
}


class PageHandler(BaseHandler):
    def do_GET(self):
        path = unquote(urlsplit(self.path).path)
        if path in ("/", "/index.html", "/app", "/app/"):
            self._redirect(APP_PATH)
        elif path == AUTH_SCRIPT_PATH:
            self._send_response(200, (HERE / "certificate-sign.js").read_bytes(), "text/javascript; charset=utf-8",
                                {"Cache-Control": "no-cache"})
        else:
            self._serve_static_file(path)

    def _redirect(self, location):
        self.send_response(301)
        self.send_header("Location", location)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _serve_static_file(self, path):
        """Read-only files from the forms-as-code repo and the sibling forms repo."""
        parts = path.split("/")[1:]
        root = STATIC_MOUNTS.get(parts[0]) if parts else None
        rest = [p for p in parts[1:] if p]
        if not root or any(p.startswith(".") or "\\" in p or ":" in p for p in rest):
            return self.send_error(404)
        target = root.joinpath(*rest).resolve()
        if not target.is_relative_to(root) or target.is_relative_to(HERE) or target.is_relative_to(CERTS):
            return self.send_error(404)
        if target.is_dir():
            if not path.endswith("/"):
                return self._redirect(path + "/")
            target = target / "index.html"
        ctype = STATIC_TYPES.get(target.suffix.lower())
        if not ctype or not target.is_file():
            return self.send_error(404)
        body = target.read_bytes()
        if target == FORMS_AS_CODE / "app" / "index.html":
            body = inject_authentication_script(body)
        self._send_response(200, body, ctype, {"Cache-Control": "no-cache"})


class ApiHandler(BaseHandler):
    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", PAGE_ORIGIN)
        self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")

    def _client_certificate_info(self):
        """Return details of the verified client/login certificate, or None."""
        client_certificate = self.connection.getpeercert()
        if not client_certificate:
            return None
        client_certificate_der = self.connection.getpeercert(binary_form=True)
        subject = _flatten_rdn_sequence(client_certificate.get("subject", ()))
        subject_alternative_names = client_certificate.get("subjectAltName", ())
        email = next((value for name, value in subject_alternative_names if name == "email"),
                     subject.get("emailAddress", ""))
        fingerprint = hashlib.sha256(client_certificate_der).hexdigest().upper()
        return {
            "subject": subject,
            "issuer": _flatten_rdn_sequence(client_certificate.get("issuer", ())),
            "email": email,
            "serial": client_certificate.get("serialNumber"),
            "validFrom": client_certificate.get("notBefore"),
            "validTo": client_certificate.get("notAfter"),
            "fingerprint256": ":".join(fingerprint[index:index + 2]
                                        for index in range(0, len(fingerprint), 2)),
            # The TLS layer already rejected anything not chaining to client-ca.pem
            "trusted": True,
            "authError": None,
        }

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        if self.path != "/api/whoami":
            return self._send_json_response(404, {"error": "Not found"})
        client_certificate_info = self._client_certificate_info()
        if not client_certificate_info:
            return self._send_json_response(401, {"present": False, "error": "No client certificate presented"})
        return self._send_json_response(200, {"present": True, **client_certificate_info})


SHORT_NAMES = {
    "commonName": "CN", "organizationName": "O", "organizationalUnitName": "OU",
    "countryName": "C", "stateOrProvinceName": "ST", "localityName": "L",
    "domainComponent": "DC", "serialNumber": "serialNumber", "emailAddress": "emailAddress",
}


def _flatten_rdn_sequence(rdn_seq):
    """Flatten ssl's ((('commonName', 'Jane'),), ...) structure into {'CN': 'Jane'}."""
    flattened_names = {}
    for rdn in rdn_seq:
        for key, value in rdn:
            key = SHORT_NAMES.get(key, key)
            flattened_names[key] = value if key not in flattened_names else f"{flattened_names[key]}+{value}"
    return flattened_names


class TLSServer(ThreadingHTTPServer):
    """Perform each TLS handshake in the connection's own thread.

    Certificate selection can wait for user input. Performing it in the accepting
    thread would prevent other browser connections from being accepted meanwhile.
    """

    # On Windows, address reuse lets a second server bind the same port silently
    # and take some of the connections. Refuse instead.
    allow_reuse_address = sys.platform != "win32"

    def __init__(self, address, handler, tls_context):
        super().__init__(address, handler)
        self.tls_context = tls_context

    def get_request(self):
        connection, client_address = self.socket.accept()
        tls_connection = self.tls_context.wrap_socket(
            connection, server_side=True, do_handshake_on_connect=False)
        return tls_connection, client_address

    def finish_request(self, request, client_address):
        request.settimeout(180)   # time to pick a certificate and enter the PIN
        try:
            request.do_handshake()
        except (ssl.SSLError, OSError) as e:
            print(f"TLS handshake on port {self.server_address[1]} failed: {e}", flush=True)
            return
        request.settimeout(None)
        super().finish_request(request, client_address)

    def handle_error(self, request, client_address):
        print(f"Error handling a request on port {self.server_address[1]}:", flush=True)
        super().handle_error(request, client_address)


def make_server(port, handler, require_client_certificate):
    tls_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    tls_context.minimum_version = ssl.TLSVersion.TLSv1_2
    tls_context.load_cert_chain(certificate_path("server-cert.pem"), certificate_path("server-key.pem"))
    if require_client_certificate:
        # The CA list both authenticates the client/login certificate and limits
        # the certificates offered by the browser's picker.
        tls_context.load_verify_locations(certificate_path("client-ca.pem"))
        # An absent certificate reaches the API for a useful 401; an untrusted
        # certificate is still rejected during the TLS handshake.
        tls_context.verify_mode = ssl.CERT_OPTIONAL
    return TLSServer(("localhost", port), handler, tls_context)


def main(argv=None):
    argument_parser = argparse.ArgumentParser(
        description="Certificate authentication server for forms-as-code.")
    argument_parser.add_argument(
        "--forms-as-code", metavar="DIR", default=os.environ.get("FORMS_AS_CODE_DIR"),
        help="the forms-as-code repository (default: this folder's parent or a sibling checkout)")
    argument_parser.add_argument(
        "--certs-dir", metavar="DIR", default=os.environ.get("CERTS_DIR"),
        help="folder containing server-cert.pem, server-key.pem, and client-ca.pem")
    arguments = argument_parser.parse_args(argv)

    global CERTS, FORMS_AS_CODE, STATIC_MOUNTS
    CERTS = Path(arguments.certs_dir).resolve() if arguments.certs_dir else HERE / "certs"
    FORMS_AS_CODE = find_forms_as_code(arguments.forms_as_code)
    if not FORMS_AS_CODE:
        sys.exit("Could not find the forms-as-code repository (app/app.js). "
                 "Pass --forms-as-code DIR or set FORMS_AS_CODE_DIR.")
    STATIC_MOUNTS = {"forms-as-code": FORMS_AS_CODE, "forms": (FORMS_AS_CODE.parent / "forms").resolve()}

    for name in ("server-cert.pem", "server-key.pem", "client-ca.pem"):
        if not certificate_path(name).exists():
            sys.exit(f"Missing {certificate_path(name)} - see README.md for setup instructions.")

    page_server = make_server(PAGE_PORT, PageHandler, require_client_certificate=False)
    certificate_api_server = make_server(API_PORT, ApiHandler, require_client_certificate=True)
    threading.Thread(target=certificate_api_server.serve_forever, daemon=True).start()
    print(f"forms-as-code:  {PAGE_ORIGIN}{APP_PATH}   ({FORMS_AS_CODE})")
    print(f"Certificate API: https://localhost:{API_PORT}/api/whoami")
    try:
        page_server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
