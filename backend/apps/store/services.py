"""Changing the store's settings. Past sales keep the details they were sold with (they're snapshots)."""

from django.db import transaction

from apps.audit import services as audit
from apps.audit.models import AuditEntry

from .models import StoreSettings

LABELS = {
    "name": "store name",
    "code": "store code",
    "address": "address",
    "state": "state",
    "gstin": "GSTIN",
    "prices_include_tax": "prices include GST",
    "cashier_discount_limit_pct": "cashier discount limit",
}


@transaction.atomic
def update_settings(actor, changes: dict) -> StoreSettings:
    StoreSettings.load()
    store = StoreSettings.objects.select_for_update().get(pk=1)
    before = {field: getattr(store, field) for field in changes}
    changed = {field: [before[field], value] for field, value in changes.items() if before[field] != value}
    if not changed:
        return store
    for field, (_, value) in changed.items():
        setattr(store, field, value)
    store.full_clean()
    store.save()
    audit.record(
        actor,
        AuditEntry.Action.SETTINGS_UPDATE,
        "store",
        "Changed " + ", ".join(LABELS[field] for field in changed),
        changes=changed,
    )
    return store
