"""Production settings. Every value comes from the real environment; see docs/deployment.md.

backend/.env is never read here (base.py skips it), so a missing variable stops the process at start-up
instead of falling back to a development value.
"""

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403
from .base import MIDDLEWARE, SPECTACULAR_SETTINGS, env, env_bool


def required(key: str) -> str:
    value = env(key)
    if not value:
        raise ImproperlyConfigured(f"{key} must be set in production.")
    return value


def env_list(key: str) -> list[str]:
    return [item.strip() for item in (env(key, "") or "").split(",") if item.strip()]


DEBUG = False
SECRET_KEY = required("DJANGO_SECRET_KEY")
if len(SECRET_KEY) < 50 or SECRET_KEY in {"change-me", "dev-only-insecure-key"}:
    raise ImproperlyConfigured("DJANGO_SECRET_KEY must be a random value of at least 50 characters.")

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS")
if not ALLOWED_HOSTS:
    raise ImproperlyConfigured("DJANGO_ALLOWED_HOSTS must list the site's host names.")
# The SPA and API share one origin, so CORS isn't needed. List extra origins only if a proxy changes it.
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS")

# --- Database: PostgreSQL only, credentials from the environment ---
if env("DB_ENGINE") == "sqlite":
    raise ImproperlyConfigured("Production uses PostgreSQL; unset DB_ENGINE.")
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": required("POSTGRES_DB"),
        "USER": required("POSTGRES_USER"),
        "PASSWORD": required("POSTGRES_PASSWORD"),
        "HOST": required("POSTGRES_HOST"),
        "PORT": env("POSTGRES_PORT", "5432"),
        "ATOMIC_REQUESTS": True,
        "CONN_MAX_AGE": int(env("POSTGRES_CONN_MAX_AGE", "60") or 60),
        "CONN_HEALTH_CHECKS": True,
        # "require" (or stricter) when the database is on another host.
        "OPTIONS": {"sslmode": env("POSTGRES_SSLMODE", "prefer"), "connect_timeout": 10},
    }
}

# --- Shared cache: login throttling and the approval-PIN lockout must count across every worker and
# instance. The database cache needs no extra service. It gets its own autocommitting connection to the
# same database (config/routers.py explains why); create its table with
# `createcachetable --database cache`.
DATABASES["cache"] = {**DATABASES["default"], "ATOMIC_REQUESTS": False}
DATABASE_ROUTERS = ["config.routers.CacheRouter"]
CACHES = {"default": {"BACKEND": "django.core.cache.backends.db.DatabaseCache", "LOCATION": "loomdesk_cache"}}

# --- HTTPS. TLS ends at the proxy or platform in front of the app, which must set X-Forwarded-Proto
# (and overwrite any value a client sends).
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env_bool("DJANGO_SECURE_SSL_REDIRECT", True)
SECURE_HSTS_SECONDS = int(env("DJANGO_SECURE_HSTS_SECONDS", "31536000") or 0)
SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool("DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS", False)
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
# A shift-length session: staff sign in again after 12 hours.
SESSION_COOKIE_AGE = 12 * 60 * 60
X_FRAME_OPTIONS = "DENY"

# --- Static files: the SPA build and Django admin assets, collected into STATIC_ROOT by
# `collectstatic` and served by WhiteNoise. Vite already fingerprints the SPA's files, so they're
# stored under their own names (compressed, not renamed) and cached for a year; index.html isn't a
# static file (the SPA view serves it uncached).
MIDDLEWARE = [MIDDLEWARE[0], "whitenoise.middleware.WhiteNoiseMiddleware", *MIDDLEWARE[1:]]
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}
WHITENOISE_IMMUTABLE_FILE_TEST = r"^.+[-.][0-9A-Za-z_-]{8,12}\.\w+$"

# --- Uploaded media. Served by Django from MEDIA_ROOT unless a proxy or CDN serves /media/ itself.
SERVE_MEDIA = env_bool("DJANGO_SERVE_MEDIA", True)

# The API schema and Swagger UI describe every endpoint; only admins may read them in production.
SPECTACULAR_SETTINGS = {**SPECTACULAR_SETTINGS, "SERVE_PERMISSIONS": ["apps.accounts.permissions.IsAdmin"]}
