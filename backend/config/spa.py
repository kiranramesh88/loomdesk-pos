from django.conf import settings
from django.db import transaction
from django.http import HttpRequest, HttpResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET


# The shell is a file read: no transaction (ATOMIC_REQUESTS would open one), so it loads even if the DB is down.
@transaction.non_atomic_requests
@require_GET
@ensure_csrf_cookie
def spa_index(request: HttpRequest) -> HttpResponse:
    """Serve the built SPA shell for any non-API path.

    In development the Vite dev server serves the frontend; this view only
    matters once `npm run build` has produced frontend/dist.
    """
    index = settings.FRONTEND_DIST_DIR / "index.html"
    if not index.exists():
        return HttpResponse(
            "Frontend build not found. Run the Vite dev server (npm run dev) or build the frontend.",
            status=404,
            content_type="text/plain",
        )
    html = index.read_text(encoding="utf-8")
    if nonce := getattr(request, "csp_nonce", None):
        # The page's CSP allows inline <style> only with this nonce; src/app/cspNonce.ts reads it.
        meta = f'<meta name="csp-nonce" content="{nonce}" />'
        html = html.replace("<head>", "<head>" + meta, 1)
    response = HttpResponse(html, content_type="text/html")
    # The shell names the current build's hashed assets, so browsers must revalidate it after a deploy.
    response["Cache-Control"] = "no-cache"
    return response
