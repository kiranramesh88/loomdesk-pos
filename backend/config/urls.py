from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path, re_path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from apps.sales.urls import billing_urlpatterns, sales_urlpatterns

from .spa import spa_index

api_v1 = [
    path("auth/", include("apps.accounts.urls")),
    path("store/", include("apps.store.urls")),
    path("catalog/", include("apps.catalog.urls")),
    path("inventory/", include("apps.inventory.urls")),
    path("billing/", include(billing_urlpatterns)),
    path("sales/", include(sales_urlpatterns)),
    path("schema/", SpectacularAPIView.as_view(), name="api-schema"),
    path("docs/", SpectacularSwaggerView.as_view(url_name="api-schema"), name="api-docs"),
]

urlpatterns = [
    # Django's admin is moved off /admin/ because the SPA owns /admin/* (incl. /admin/mobile/).
    path("django-admin/", admin.site.urls),
    path("api/v1/", include(api_v1)),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# Everything else is a client-side route; serve the SPA shell so direct loads and refreshes work.
urlpatterns += [re_path(r"^(?!api/|django-admin/|static/|media/).*$", spa_index, name="spa")]
