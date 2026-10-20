import os

from .base import *  # noqa: F403

SECRET_KEY = "test-only-key"
DEBUG = False
ALLOWED_HOSTS = ["testserver", "localhost"]
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
MEDIA_ROOT = BASE_DIR / ".test-media"  # noqa: F405

if os.environ.get("DB_ENGINE") == "sqlite":
    # Keep ATOMIC_REQUESTS like base.py, so SQLite runs wrap requests in transactions as PostgreSQL does.
    DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:", "ATOMIC_REQUESTS": True}}

# Throttling is exercised explicitly in the tests that need it.
REST_FRAMEWORK = {**REST_FRAMEWORK, "DEFAULT_THROTTLE_RATES": {"login": "1000/min"}}  # noqa: F405
