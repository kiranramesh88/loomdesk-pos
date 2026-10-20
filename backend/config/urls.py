from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.static import serve
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerSplitView

from apps.sales.urls import billing_urlpatterns, sales_urlpatterns

from .spa import spa_index

api_v1 = [
    path("auth/", include("apps.accounts.urls")),
    path("store/", include("apps.store.urls")),
    path("catalog/", include("apps.catalog.urls")),
    path("inventory/", include("apps.inventory.urls")),
    path("suppliers/", include("apps.suppliers.urls")),
    path("billing/", include(billing_urlpatterns)),
    path("sales/", include(sales_urlpatterns)),
    path("returns/", include("apps.returns.urls")),
    path("staff/", include("apps.accounts.staff_urls")),
    path("schema/", SpectacularAPIView.as_view(), name="api-schema"),
    # The split view serves its start-up script as a file, so the CSP needs no inline scripts.
    path(
        "docs/",
        SpectacularSwaggerSplitView.as_view(url_name="api-schema", template_name="loomdesk/swagger_ui.html"),
        name="api-docs",
    ),
]

urlpatterns = [
    # Django's admin is moved off /admin/ because the SPA owns /admin/* (incl. /admin/mobile/).
    path("django-admin/", admin.site.urls),
    path("api/v1/", include(api_v1)),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
elif getattr(settings, "SERVE_MEDIA", False):
    # Production without a proxy or CDN for /media/: uploaded product photos from MEDIA_ROOT.
    # `serve` refuses paths outside MEDIA_ROOT and never lists directories.
    urlpatterns += [re_path(r"^media/(?P<path>.*)$", serve, {"document_root": settings.MEDIA_ROOT})]

# API paths answer in the JSON error envelope; everything else gets plain pages.
handler404 = "config.exceptions.not_found"
handler500 = "config.exceptions.server_error"

# Everything else is a client-side route; serve the SPA shell so direct loads and refreshes work.
urlpatterns += [re_path(r"^(?!api/|django-admin/|static/|media/).*$", spa_index, name="spa")]
