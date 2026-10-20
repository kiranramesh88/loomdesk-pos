from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.catalog.models import Product
from apps.inventory.models import StockMovement
from apps.sales.models import Sale
from apps.store import demo_catalogue, seed_data
from apps.suppliers.models import Purchase, Supplier


class Command(BaseCommand):
    help = (
        "Load the demo products, variants, opening stock and suppliers into a new, empty store, for a hosted demo. "
        "Creates no accounts, passwords or PINs, and refuses a store that already has products, stock, "
        "suppliers or sales. Allowed under production settings."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--photos",
            type=Path,
            default=demo_catalogue.PHOTO_DIR,
            help="Folder of product photos named by product code, e.g. P-1001.jpg (default: seed/photos/, "
            "filled by fetch_seed_photos). Products without a file have no photo.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        # Only ever adds to an empty store: it never mixes demo records into real ones or replaces anything.
        found = [
            label
            for label, model in (("products", Product), ("stock movements", StockMovement), ("suppliers", Supplier),
                                 ("purchases", Purchase), ("sales", Sale))
            if model.objects.exists()
        ]
        if found:
            raise CommandError(
                f"This store already has {', '.join(found)}. load_demo_catalogue only fills a new, empty store; nothing was changed."
            )
        photos = demo_catalogue.load_catalogue(photo_dir=options["photos"])
        demo_catalogue.load_suppliers()

        self.stdout.write(self.style.SUCCESS(
            f"Demo catalogue loaded: {len(seed_data.PRODUCTS)} products with opening stock, "
            f"{len(seed_data.SUPPLIERS)} suppliers. No accounts were created."
        ))
        if photos < len(seed_data.PRODUCTS):
            self.stdout.write(self.style.WARNING(
                f"  {photos} of {len(seed_data.PRODUCTS)} products have a photo. "
                "Run fetch_seed_photos before this command, or upload the rest from each product's page."
            ))
        self.stdout.write("  Create accounts with create_staff.")
