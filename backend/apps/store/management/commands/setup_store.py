from django.core.management.base import BaseCommand
from django.db import transaction

from apps.store.models import StoreSettings
from apps.store.reference import ensure_reference_data

# Receipt details whose model defaults are the demo store's. (The default state, Kerala, is a real state.)
DEMO_FIELDS = ("name", "code", "address")


class Command(BaseCommand):
    help = (
        "Prepare a new store database: the store record, default GST rules and categories. "
        "Safe to re-run; it adds what's missing and changes nothing else. Creates no products, accounts or passwords."
    )

    def add_arguments(self, parser):
        parser.add_argument("--name", help="Store name printed on receipts.")
        parser.add_argument("--code", help="Store code, e.g. LL-KKD-01.")
        parser.add_argument("--address", help="Store address printed on receipts.")
        parser.add_argument("--state", help="State, for GST.")
        parser.add_argument("--gstin", help="The store's GSTIN.")

    @transaction.atomic
    def handle(self, *args, **options):
        store = StoreSettings.load()
        changed = [f for f in ("name", "code", "address", "state", "gstin") if options[f] is not None]
        for field in changed:
            setattr(store, field, options[field].strip())
        if changed:
            store.full_clean()
            store.save()
        rules, categories = ensure_reference_data()
        self.stdout.write(self.style.SUCCESS(f"Store ready: {store.name} ({store.code})."))
        self.stdout.write(f"  {len(rules)} tax rules, {len(categories)} categories. Review the GST defaults with the store's accountant.")
        # Every sale snapshots these onto its receipt, so a demo value left here is printed for good.
        demo = [f for f in DEMO_FIELDS if getattr(store, f) == StoreSettings._meta.get_field(f).default]
        if demo:
            flags = " ".join(f"--{f}" for f in demo)
            self.stdout.write(self.style.WARNING(f"  Still the demo store's {', '.join(demo)}. Set {"it" if len(demo) == 1 else "them"} with {flags} before the first sale."))
        if not store.gstin:
            self.stdout.write(self.style.WARNING("  No GSTIN set. Receipts show 'Not recorded' until you pass --gstin."))
