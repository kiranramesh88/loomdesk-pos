"""Smoke test a running LoomDesk deployment (docs/deployment.md §8). Standard library only; prints no secrets.

    python deploy/smoke_test.py https://loomdesk.onrender.com
    python deploy/smoke_test.py https://… --admin-email you@example.com --admin-password-env SMOKE_ADMIN_PASSWORD

Read-only apart from signing in and out. With --admin-email, the password comes from the named environment
variable, never the command line. --forwarded-proto https is for a server reached directly, without its TLS proxy.
--min-products and --min-photos make an empty catalogue, or missing photos, a failure.
"""

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(f"{'PASS' if ok else 'FAIL'} {name}{' — ' + detail if detail else ''}", flush=True)


class Client:
    """Keeps cookies by hand: urllib won't send a Secure cookie over plain HTTP, and some runs need that."""

    def __init__(self, base, forwarded_proto):
        self.base = base.rstrip("/")
        self.headers = {"X-Forwarded-Proto": forwarded_proto} if forwarded_proto else {}
        # Django's CSRF check compares Origin with the scheme the server believes it was reached on.
        parts = urllib.parse.urlsplit(self.base)
        self.origin = f"{forwarded_proto or parts.scheme}://{parts.netloc}"
        self.cookies = {}
        self.opener = urllib.request.build_opener(NoRedirect)

    def request(self, path, data=None, headers=None):
        all_headers = {**self.headers, **(headers or {})}
        if self.cookies:
            all_headers["Cookie"] = "; ".join(f"{k}={v}" for k, v in self.cookies.items())
        body = json.dumps(data).encode() if data is not None else None
        if body is not None:
            all_headers["Content-Type"] = "application/json"
        req = urllib.request.Request(self.base + path, data=body, headers=all_headers, method="POST" if body else "GET")
        try:
            response = self.opener.open(req, timeout=90)  # a sleeping free instance takes about a minute
        except urllib.error.HTTPError as err:
            response = err
        for header in response.headers.get_all("Set-Cookie") or []:
            name, _, rest = header.partition("=")
            self.cookies[name.strip()] = rest.split(";", 1)[0]
        return response.status, response.headers, response.read()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("base_url")
    parser.add_argument("--forwarded-proto", default="")
    parser.add_argument("--admin-email")
    parser.add_argument("--admin-password-env")
    parser.add_argument("--min-products", type=int, default=0)
    parser.add_argument("--min-photos", type=int, default=0)
    args = parser.parse_args()
    client = Client(args.base_url, args.forwarded_proto)

    status, headers, body = client.request("/api/v1/auth/session/")
    cookie = next((c for c in headers.get_all("Set-Cookie") or [] if c.startswith("csrftoken=")), "")
    check("session endpoint answers, signed out", status == 200 and json.loads(body or b"{}").get("user", 1) is None, str(status))
    check("CSRF cookie is Secure", "secure" in cookie.lower())

    status, headers, body = client.request("/login")
    page = body.decode("utf-8", "replace")
    nonce = re.search(r'name="csp-nonce" content="([^"]+)"', page)
    csp = headers.get("Content-Security-Policy", "")
    check("app page loads, never cached", status == 200 and headers.get("Cache-Control") == "no-cache", str(status))
    check("CSP header carries the page's nonce", bool(nonce) and f"'nonce-{nonce.group(1)}'" in csp)
    asset = re.search(r'/static/assets/[^"]+\.js', page)
    if asset:
        status, headers, _ = client.request(asset.group(0))
        check("hashed asset served, cached for good", status == 200 and "immutable" in headers.get("Cache-Control", ""), str(status))
    else:
        check("hashed asset named in the page", False)
    check("a missing asset is a plain 404", client.request("/static/assets/does-not-exist.js")[0] == 404)
    status, _, body = client.request("/api/v1/no-such-endpoint/")
    check("unknown API path gets the error envelope", status == 404 and json.loads(body).get("code") == "not_found", str(status))
    check("admin data refused when signed out", client.request("/api/v1/inventory/variants/")[0] == 403)

    if args.admin_email:
        password = os.environ.get(args.admin_password_env or "", "")
        if not password:
            check(f"admin password in ${args.admin_password_env}", False)
            return
        token = client.cookies.get("csrftoken", "")
        status, _, body = client.request(
            "/api/v1/auth/login/", {"email": args.admin_email, "password": password},
            headers={"X-CSRFToken": token, "Origin": client.origin},
        )
        role = json.loads(body).get("role") if status == 200 else None
        check("admin signs in", status == 200 and role == "admin", f"{status}, role {role}")
        if status == 200:
            status, _, body = client.request("/api/v1/catalog/products/?page_size=200")
            products = json.loads(body).get("results", []) if status == 200 else []
            check(f"catalogue has at least {args.min_products} product(s)", status == 200 and len(products) >= args.min_products, f"{len(products)} products")
            photos = [p["image_url"] for p in products if p.get("image_url")]
            served = sum(1 for url in photos if client.request(url)[0] == 200)
            check(f"product photos served (at least {args.min_photos})", served == len(photos) and served >= args.min_photos, f"{served} of {len(photos)} with a photo")
            client.request("/api/v1/auth/logout/", {}, headers={"X-CSRFToken": client.cookies.get("csrftoken", ""), "Origin": client.origin})

    print(f"\n{sum(results)}/{len(results)} passed")


if __name__ == "__main__":
    main()
    sys.exit(0 if results and all(results) else 1)
