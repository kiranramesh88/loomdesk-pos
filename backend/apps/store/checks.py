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
