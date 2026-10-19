from django.conf import settings
from django.http import HttpRequest, HttpResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET


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
    return HttpResponse(index.read_text(encoding="utf-8"), content_type="text/html")
