"""Production configuration: settings that refuse to start without real values, error pages,
cache routing and the deployment checks."""

import json
import os
import subprocess
import sys

import pytest
from django.core.checks import run_checks
from django.test import RequestFactory

from apps.store import checks
from config import exceptions
from config.routers import CacheRouter

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GOOD_ENV = {
    "DJANGO_SETTINGS_MODULE": "config.settings.prod",
    "DJANGO_SECRET_KEY": "x" * 64,
    "DJANGO_ALLOWED_HOSTS": "pos.example.com",
    "POSTGRES_DB": "loomdesk_prod",
    "POSTGRES_USER": "loomdesk_app",
    "POSTGRES_PASSWORD": "not-a-real-password",
    "POSTGRES_HOST": "db.internal",
}
PRINT_SETTINGS = """
import json
from django.conf import settings
print(json.dumps({
    "debug": settings.DEBUG,
    "hosts": settings.ALLOWED_HOSTS,
    "db": {a: {"name": d["NAME"], "atomic": d["ATOMIC_REQUESTS"]} for a, d in settings.DATABASES.items()},
    "routers": settings.DATABASE_ROUTERS,
    "cache": settings.CACHES["default"]["BACKEND"],
    "secure": [settings.SESSION_COOKIE_SECURE, settings.CSRF_COOKIE_SECURE, settings.SECURE_SSL_REDIRECT],
    "hsts": settings.SECURE_HSTS_SECONDS,
    "whitenoise": "whitenoise.middleware.WhiteNoiseMiddleware" in settings.MIDDLEWARE,
    "schema": settings.SPECTACULAR_SETTINGS["SERVE_PERMISSIONS"],
    "middleware": settings.MIDDLEWARE[:3],
    "csp": [settings.LOOMDESK_CSP_ENABLED, settings.LOOMDESK_CSP_REPORT_ONLY],
    "admin": "config.apps.LoomDeskAdminConfig" in settings.INSTALLED_APPS,
}))
"""


def load_prod_settings(**overrides):
    """Import the production settings in a fresh interpreter with only the given variables set."""
    env = {k: v for k, v in os.environ.items() if not k.startswith(("DJANGO_", "POSTGRES_", "DB_ENGINE", "SEED_"))}
    env.update(GOOD_ENV)
    for key, value in overrides.items():
        if value is None:
            env.pop(key, None)
        else:
            env[key] = value
    code = "import django; django.setup()\n" + PRINT_SETTINGS
    return subprocess.run([sys.executable, "-c", code], cwd=BACKEND_DIR, env=env, capture_output=True, text=True, timeout=60)


def test_production_settings_load_from_the_environment():
    result = load_prod_settings()
    assert result.returncode == 0, result.stderr
    values = json.loads(result.stdout)
    assert values["debug"] is False
    assert values["hosts"] == ["pos.example.com"]
    assert values["secure"] == [True, True, True]
    assert values["hsts"] == 31536000
    assert values["whitenoise"] is True
    assert values["middleware"] == [
        "django.middleware.security.SecurityMiddleware",
        "whitenoise.middleware.WhiteNoiseMiddleware",
        "config.csp.ContentSecurityPolicyMiddleware",
    ]
    assert values["csp"] == [True, False]  # enforced unless DJANGO_CSP_REPORT_ONLY is set
    assert values["admin"] is True
    assert values["schema"] == ["apps.accounts.permissions.IsAdmin"]
    # The cache has its own autocommitting connection to the same database.
    assert values["cache"].endswith("DatabaseCache")
    assert values["routers"] == ["config.routers.CacheRouter"]
    assert values["db"]["default"] == {"name": "loomdesk_prod", "atomic": True}
    assert values["db"]["cache"] == {"name": "loomdesk_prod", "atomic": False}


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"DJANGO_SECRET_KEY": None}, "DJANGO_SECRET_KEY must be set"),
        ({"DJANGO_SECRET_KEY": "short"}, "at least 50 characters"),
        ({"DJANGO_ALLOWED_HOSTS": None}, "DJANGO_ALLOWED_HOSTS"),
        ({"DB_ENGINE": "sqlite"}, "Production uses PostgreSQL"),
        # backend/.env (if present) holds development credentials; production must not fall back to them.
        ({"POSTGRES_PASSWORD": None}, "POSTGRES_PASSWORD must be set"),
        ({"POSTGRES_USER": None}, "POSTGRES_USER must be set"),
    ],
)
def test_production_settings_refuse_to_start_without_real_values(overrides, message):
    result = load_prod_settings(**overrides)
    assert result.returncode != 0
    assert message in result.stderr


def test_cache_router_keeps_the_cache_table_on_its_own_connection():
    class CacheEntry:
        class _meta:
            app_label = "django_cache"

    class Sale:
        class _meta:
            app_label = "sales"

    router = CacheRouter()
    assert router.db_for_write(CacheEntry) == "cache"
    assert router.db_for_read(CacheEntry) == "cache"
    assert router.db_for_write(Sale) is None
    assert router.allow_migrate("cache", "django_cache") is True
    assert router.allow_migrate("default", "django_cache") is False
    assert router.allow_migrate("cache", "sales") is False
    assert router.allow_migrate("default", "sales") is True


def test_unknown_api_paths_answer_in_the_error_envelope(client):
    response = client.get("/api/v1/no-such-endpoint/")
    assert response.status_code == 404
    assert response.json() == {"detail": "Not found.", "code": "not_found", "fields": {}}


def test_server_errors_reveal_nothing():
    api = exceptions.server_error(RequestFactory().get("/api/v1/sales/"))
    assert api.status_code == 500
    assert json.loads(api.content) == {
        "detail": "Something went wrong on the server. Please try again.",
        "code": "server_error",
        "fields": {},
    }
    page = exceptions.server_error(RequestFactory().get("/admin/"))
    assert page.status_code == 500
    assert page["Content-Type"].startswith("text/plain")


def test_spa_shell_is_never_cached(client, settings, tmp_path):
    (tmp_path / "index.html").write_text('<div id="root"></div>', encoding="utf-8")
    settings.FRONTEND_DIST_DIR = tmp_path
    response = client.get("/admin/mobile/")
    assert response.status_code == 200
    assert response["Cache-Control"] == "no-cache"


def _ids(errors):
    return {e.id for e in errors}


def test_deploy_check_needs_the_frontend_build_and_collected_assets(settings, tmp_path):
    settings.FRONTEND_DIST_DIR = tmp_path / "dist"
    settings.STATIC_ROOT = tmp_path / "static"
    assert _ids(checks.frontend_build_check(None)) == {"loomdesk.E001", "loomdesk.E002"}
    (tmp_path / "dist").mkdir()
    (tmp_path / "dist" / "index.html").write_text("<html></html>", encoding="utf-8")
    (tmp_path / "static" / "assets").mkdir(parents=True)
    assert checks.frontend_build_check(None) == []


def test_deploy_check_rejects_a_per_process_cache(settings):
    settings.CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
    assert _ids(checks.shared_cache_check(None)) == {"loomdesk.E003"}


def test_deploy_check_rejects_a_database_cache_inside_the_request_transaction(settings):
    # Without the router the cache table sits on "default", whose requests are atomic.
    settings.CACHES = {"default": {"BACKEND": "django.core.cache.backends.db.DatabaseCache", "LOCATION": "t"}}
    assert _ids(checks.shared_cache_check(None)) == {"loomdesk.E004"}


def test_deploy_checks_are_registered():
    ids = _ids(run_checks(include_deployment_checks=True))
    # The test settings have no build and a per-process cache, which the deploy checks must catch.
    assert {"loomdesk.E003"} <= ids
