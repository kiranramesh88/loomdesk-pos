"""Deployment checks, run by `manage.py check --deploy` before a release goes live."""

from django.conf import settings
from django.core.checks import Error, Tags, register


@register(Tags.security, deploy=True)
def frontend_build_check(app_configs, **kwargs):
    errors = []
    if not (settings.FRONTEND_DIST_DIR / "index.html").exists():
        errors.append(
            Error(
                "The frontend build is missing, so every page would 404.",
                hint="Run `npm ci && npm run build` in frontend/ before collectstatic.",
                id="loomdesk.E001",
            )
        )
    if not (settings.STATIC_ROOT / "assets").is_dir():
        errors.append(
            Error(
                "STATIC_ROOT has no SPA assets, so the app's scripts would 404.",
                hint="Run `manage.py collectstatic --noinput` after building the frontend.",
                id="loomdesk.E002",
            )
        )
    return errors


@register(Tags.caches, deploy=True)
def shared_cache_check(app_configs, **kwargs):
    backend = settings.CACHES["default"]["BACKEND"]
    if backend.endswith("DatabaseCache"):
        from django.db import router
        from django.core.cache import cache

        alias = router.db_for_write(cache.cache_model_class)
        if settings.DATABASES[alias].get("ATOMIC_REQUESTS"):
            return [
                Error(
                    "The database cache shares the request transaction, so a rolled-back error response would "
                    "erase login-throttle counts.",
                    hint="Route the django_cache model to an alias without ATOMIC_REQUESTS (config.routers.CacheRouter).",
                    id="loomdesk.E004",
                )
            ]
    if backend.endswith("LocMemCache"):
        return [
            Error(
                "The cache is per-process, so login throttling wouldn't be shared between workers.",
                hint="Use the production settings' DatabaseCache (run `createcachetable`) or another shared cache.",
                id="loomdesk.E003",
            )
        ]
    return []
