"""Send Django's database cache to its own connection.

API requests run in a transaction (ATOMIC_REQUESTS), and an error response rolls it back. The login
throttle records its counter exactly when it answers with an error, so on the request's own connection
that write would be undone and the limit would never trigger. The `cache` alias is the same database on
a separate, autocommitting connection. (The approval-PIN and Django admin limits don't use the cache:
they count in row-locked `AttemptGuard` rows, see apps/accounts/attempts.py.)
"""

CACHE_ALIAS = "cache"
CACHE_APP_LABEL = "django_cache"  # The app label DatabaseCache gives its table model.


class CacheRouter:
    def db_for_read(self, model, **hints):
        return CACHE_ALIAS if model._meta.app_label == CACHE_APP_LABEL else None

    def db_for_write(self, model, **hints):
        return CACHE_ALIAS if model._meta.app_label == CACHE_APP_LABEL else None

    def allow_relation(self, obj1, obj2, **hints):
        return None

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        # The cache table lives only on the cache alias (`createcachetable --database cache`), and the
        # app's tables only on default, so `migrate` never runs twice against the same database.
        if app_label == CACHE_APP_LABEL:
            return db == CACHE_ALIAS
        return db != CACHE_ALIAS
