from django.apps import AppConfig


class StoreConfig(AppConfig):
    name = "apps.store"
    label = "store"

    def ready(self):
        from . import checks  # noqa: F401 — registers the deployment checks
