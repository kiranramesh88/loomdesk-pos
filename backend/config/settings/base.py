import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]
REPO_DIR = BASE_DIR.parent


def _load_env_file(path: Path) -> None:
    """Populate os.environ from a simple KEY=VALUE file without overriding real env vars."""
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


PRODUCTION_SETTINGS = "config.settings.prod"

# backend/.env is a development convenience. Production reads only the real environment, so a
# missing variable fails loudly instead of quietly picking up development values from the file.
if os.environ.get("DJANGO_SETTINGS_MODULE") != PRODUCTION_SETTINGS:
    _load_env_file(BASE_DIR / ".env")


def env(key: str, default: str | None = None) -> str | None:
    return os.environ.get(key, default)


def env_bool(key: str, default: bool = False) -> bool:
    value = os.environ.get(key)
    return default if value is None else value.lower() in {"1", "true", "yes", "on"}


SECRET_KEY = env("DJANGO_SECRET_KEY", "")
DEBUG = env_bool("DJANGO_DEBUG", False)
ALLOWED_HOSTS = [h.strip() for h in (env("DJANGO_ALLOWED_HOSTS", "") or "").split(",") if h.strip()]

INSTALLED_APPS = [
    "config.apps.LoomDeskAdminConfig",  # django.contrib.admin with sign-in limits
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "django_filters",
    "drf_spectacular",
    "apps.accounts",
    "apps.store",
    "apps.catalog",
    "apps.inventory",
    "apps.customers",
    "apps.suppliers",
    "apps.sales",
    "apps.returns",
    "apps.audit",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "config.csp.ContentSecurityPolicyMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

# Content-Security-Policy per path (config/csp.py). Report-only sends it without enforcing it.
LOOMDESK_CSP_ENABLED = True
LOOMDESK_CSP_REPORT_ONLY = env_bool("DJANGO_CSP_REPORT_ONLY", False)
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "config" / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

if env("DB_ENGINE") == "sqlite":
    DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": BASE_DIR / "db.sqlite3", "ATOMIC_REQUESTS": True}}
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": env("POSTGRES_DB", "loomdesk"),
            "USER": env("POSTGRES_USER", "loomdesk"),
            "PASSWORD": env("POSTGRES_PASSWORD", ""),
            "HOST": env("POSTGRES_HOST", "localhost"),
            "PORT": env("POSTGRES_PORT", "5432"),
            "ATOMIC_REQUESTS": True,
        }
    }

AUTH_USER_MODEL = "accounts.User"
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-in"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = Path(env("DJANGO_STATIC_ROOT") or BASE_DIR / "staticfiles")
MEDIA_URL = "/media/"
# Uploaded product photos. In production point this at storage that outlives a deploy (a mounted volume).
MEDIA_ROOT = Path(env("DJANGO_MEDIA_ROOT") or BASE_DIR / "media")

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# The SPA owns /admin/* (including the mandatory /admin/mobile/), so Django's
# admin lives elsewhere. See config/urls.py.
FRONTEND_DIST_DIR = REPO_DIR / "frontend" / "dist"
# The SPA build's hashed assets (built with base "/static/") are ordinary static files:
# served by runserver in development and gathered by collectstatic for deployment.
STATICFILES_DIRS = [FRONTEND_DIST_DIR] if FRONTEND_DIST_DIR.is_dir() else []

SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"
# The SPA reads the CSRF cookie and echoes it in X-CSRFToken.
CSRF_COOKIE_HTTPONLY = False

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"plain": {"format": "%(asctime)s %(levelname)s %(name)s %(message)s"}},
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "plain"}},
    "root": {"handlers": ["console"], "level": env("DJANGO_LOG_LEVEL", "INFO")},
    "loggers": {
        # Unhandled exceptions (500s) and security events (bad host, CSRF failures) always reach the log.
        "django.request": {"level": "WARNING"},
        "django.security": {"level": "WARNING"},
    },
}

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.SessionAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_FILTER_BACKENDS": ["django_filters.rest_framework.DjangoFilterBackend"],
    "DEFAULT_PAGINATION_CLASS": "config.pagination.StandardPagination",
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "config.exceptions.api_exception_handler",
    "DEFAULT_THROTTLE_RATES": {"login": "10/min"},
}

SPECTACULAR_SETTINGS = {
    "TITLE": "LoomDesk POS API",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "ENUM_NAME_OVERRIDES": {
        "RoleEnum": "apps.accounts.models.Role",
        # Products and suppliers share active/inactive.
        "ActiveStatusEnum": "apps.catalog.models.Product.Status",
        "TaxRuleKindEnum": "apps.catalog.models.TaxRule.Kind",
        "StockMovementTypeEnum": "apps.inventory.models.StockMovement.Type",
        "StockStateEnum": "apps.catalog.serializers.STOCK_STATES",
        "PaymentMethodEnum": "apps.sales.models.Payment.Method",
        "SaleStatusEnum": "apps.sales.models.Sale.Status",
        "ReturnDispositionEnum": "apps.returns.models.ReturnLine.Disposition",
        "ReturnReasonEnum": "apps.returns.models.Return.Reason",
        "ReturnStateEnum": "apps.sales.serializers.RETURN_STATES",
        "PurchaseStatusEnum": "apps.suppliers.models.Purchase.Status",
        "SupplierPaymentMethodEnum": "apps.suppliers.models.SupplierPayment.Method",
        "DiscountKindEnum": "apps.sales.serializers.DISCOUNT_KINDS",
    },
}
