"""Content-Security-Policy for every response Django builds, chosen by path.

- The app (React shell and routes): scripts only from this origin. Styles from this origin, plus inline
  <style> elements carrying this request's nonce. Radix dialogs inject one through react-remove-scroll;
  `spa_index` hands the nonce to the page, and `src/app/cspNonce.ts` passes it on.
- The API: JSON is never a document, so nothing may load.
- Swagger UI (admin-only): its assets come from jsDelivr, and its inline <style> carries the nonce.
- Uploaded photos: shown as images only, sandboxed if opened directly.
- Django's admin: its own static files only.

Static files are answered by WhiteNoise before this middleware and carry no policy; they are the
build's own files. Django 5.2 has no CSP support of its own; this replaces nothing in Django.
"""

import secrets

from django.conf import settings

SELF = "'self'"
JSDELIVR = "https://cdn.jsdelivr.net"

# Shared by every policy: no plugins, no <base> rewriting, never framed.
_LOCKDOWN = {"object-src": ["'none'"], "base-uri": ["'none'"], "frame-ancestors": ["'none'"]}


def _app(nonce: str) -> dict[str, list[str]]:
    return {
        "default-src": [SELF],
        "script-src": [SELF],
        "style-src": [SELF, f"'nonce-{nonce}'"],
        "img-src": [SELF, "blob:"],  # blob: previews a photo chosen in the product form
        "font-src": [SELF, "data:"],  # one Manrope subset is inlined into the CSS as a data: URI
        "connect-src": [SELF],
        "form-action": [SELF],
        **_LOCKDOWN,
    }


def _api(nonce: str) -> dict[str, list[str]]:
    return {"default-src": ["'none'"], "form-action": ["'none'"], **_LOCKDOWN}


def _docs(nonce: str) -> dict[str, list[str]]:
    return {
        "default-src": ["'none'"],
        "script-src": [SELF, JSDELIVR],
        "style-src": [SELF, JSDELIVR, f"'nonce-{nonce}'"],
        "img-src": [SELF, "data:", JSDELIVR],
        "font-src": [JSDELIVR, "data:"],
        "connect-src": [SELF],
        "form-action": ["'none'"],
        **_LOCKDOWN,
    }


def _media(nonce: str) -> dict[str, list[str]]:
    return {"default-src": ["'none'"], "img-src": [SELF], "sandbox": [], **_LOCKDOWN}


def _django_admin(nonce: str) -> dict[str, list[str]]:
    return {
        "default-src": [SELF],
        "script-src": [SELF],
        "style-src": [SELF],
        "img-src": [SELF, "data:"],
        "form-action": [SELF],
        **_LOCKDOWN,
    }


def policy_for(path: str, nonce: str) -> str:
    if path.startswith("/api/v1/docs/"):
        directives = _docs(nonce)
    elif path.startswith("/api/"):
        directives = _api(nonce)
    elif path.startswith(settings.MEDIA_URL):
        directives = _media(nonce)
    elif path.startswith("/django-admin/"):
        directives = _django_admin(nonce)
    else:
        directives = _app(nonce)
    return "; ".join(" ".join([name, *sources]) for name, sources in directives.items())


class ContentSecurityPolicyMiddleware:
    """Gives each request a nonce (`request.csp_nonce`) and each response its path's policy.

    `LOOMDESK_CSP_ENABLED` turns it off (development, where Vite serves the app and Django's debug pages
    use inline scripts). `LOOMDESK_CSP_REPORT_ONLY` sends the policy as report-only, for trying a change
    in a browser's console before enforcing it. A response that already has a policy keeps it.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.csp_nonce = secrets.token_urlsafe(18)
        response = self.get_response(request)
        if not getattr(settings, "LOOMDESK_CSP_ENABLED", True):
            return response
        header = (
            "Content-Security-Policy-Report-Only"
            if getattr(settings, "LOOMDESK_CSP_REPORT_ONLY", False)
            else "Content-Security-Policy"
        )
        if "Content-Security-Policy" not in response and "Content-Security-Policy-Report-Only" not in response:
            response[header] = policy_for(request.path, request.csp_nonce)
        return response
