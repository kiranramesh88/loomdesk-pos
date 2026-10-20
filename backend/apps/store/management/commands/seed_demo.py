import os

from django.conf import settings
from django.core.files import File
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils.text import slugify

from apps.accounts.models import User
from apps.catalog.models import Category, Product, TaxRule, Variant
from apps.customers.models import Customer
from apps.inventory.models import StockMovement
from apps.inventory.services import record_movement
from apps.sales.models import InvoiceCounter, Sale
from apps.store import seed_data
from config.settings.base import PRODUCTION_SETTINGS
from apps.store.models import StoreSettings
from apps.store.reference import ensure_reference_data
from apps.suppliers.models import Supplier

PHOTO_DIR = settings.BASE_DIR / "seed" / "photos"


def ean13(first12: str) -> str:
    total = sum(int(d) * (3 if i % 2 else 1) for i, d in enumerate(first12))
    return first12 + str((10 - total % 10) % 10)


def split_stock(total: int, parts: int) -> list[int]:
    base, extra = divmod(total, parts)
    return [base + (1 if i < extra else 0) for i in range(parts)]


class Command(BaseCommand):
    help = "Load the LoomDesk demo store: staff, tax rules, catalogue with variants and stock, suppliers, customers."

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="Delete existing demo data first.")
        parser.add_argument(
            "--refresh-photos",
            action="store_true",
            help="Only replace the demo products' photos with the files in seed/photos/. Nothing else changes.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        # Demo accounts share a published password, so they must never reach a production database.
        if settings.SETTINGS_MODULE == PRODUCTION_SETTINGS:
            raise CommandError("seed_demo is for demo and development databases only; it refuses production settings.")
        if options["refresh_photos"]:
            self._refresh_photos()
            return
        if options["reset"]:
            self._reset()
        elif Product.objects.exists():
            raise CommandError("Demo data already present. Re-run with --reset to replace it.")

        password = os.environ.get("SEED_DEMO_PASSWORD", "loomdesk-demo")
        StoreSettings.load()
        self._staff(password)
        self._catalogue()
        for name, category, phone, email in seed_data.SUPPLIERS:
            Supplier.objects.create(name=name, category=category, phone=phone, email=email)
        for name, phone in seed_data.CUSTOMERS:
            Customer.objects.create(name=name, phone=phone)

        self.stdout.write(self.style.SUCCESS("Demo store loaded."))
        self.stdout.write(f"All demo accounts use the password: {password}")
        for full_name, email, role, pin in seed_data.STAFF:
            pin_note = f" - approval PIN {pin}" if pin else ""
            self.stdout.write(f"  {email:<26} {role}{pin_note}")

    def _attach_photo(self, product: Product, code: str) -> bool:
        photo = PHOTO_DIR / f"{code}.jpg"
        if not photo.exists():
            return False
        old = product.image.name
        with photo.open("rb") as fh:
            product.image.save(f"{slugify(product.name)}.jpg", File(fh), save=True)
        # Like the image endpoint: a replaced file is deleted, not left behind in media/.
        if old and old != product.image.name:
            product.image.storage.delete(old)
        return True

    def _refresh_photos(self):
        for code, name, _cat, sku, *_rest in seed_data.PRODUCTS:
            product = Product.objects.filter(sku=sku).first()
            if product is None:
                self.stdout.write(f"{code} {name}: not in this database, skipped")
            elif self._attach_photo(product, code):
                self.stdout.write(self.style.SUCCESS(f"{code} {name}: photo replaced"))
            else:
                self.stdout.write(f"{code} {name}: no file in seed/photos/, unchanged")

    def _reset(self):
        # Sales protect the variants and staff they reference, so they go first (with their lines and payments).
        Sale.objects.all().delete()
        InvoiceCounter.objects.all().delete()
        StockMovement.objects.all().delete()
        Variant.objects.all().delete()
        Product.objects.all().delete()
        Category.objects.all().delete()
        TaxRule.objects.all().delete()
        Supplier.objects.all().delete()
        Customer.objects.all().delete()
        User.objects.filter(email__in=[s[1] for s in seed_data.STAFF]).delete()

    def _staff(self, password: str):
        for full_name, email, role, pin in seed_data.STAFF:
            user = User.objects.create_user(email=email, password=password, full_name=full_name, role=role)
            if pin:
                user.set_approval_pin(pin)
                user.save(update_fields=["approval_pin_hash"])

    def _catalogue(self):
        _, categories = ensure_reference_data()

        opener = User.objects.filter(role="admin").first()
        for p_index, (code, name, cat, sku, price, cost, stock, threshold, sizes, colours) in enumerate(
            seed_data.PRODUCTS, start=1
        ):
            product = Product.objects.create(
                name=name,
                sku=sku,
                category=categories[cat],
                base_price_paise=price * 100,
                cost_price_paise=cost * 100,
            )
            self._attach_photo(product, code)

            combos = [(s, c) for s in sizes for c in colours]
            reorder = max(1, threshold // len(combos))
            for v_index, ((size, colour), qty) in enumerate(zip(combos, split_stock(stock, len(combos))), start=1):
                variant = Variant.objects.create(
                    product=product,
                    size=size,
                    colour=colour,
                    sku=f"{sku}-{slugify(size).upper()}-{colour[:3].upper()}",
                    barcode=ean13(f"890100{p_index:03d}{v_index:03d}"),
                    reorder_level=reorder,
                )
                if qty:
                    record_movement(
                        variant=variant,
                        type=StockMovement.Type.OPENING,
                        quantity_delta=qty,
                        actor=opener,
                        reason="Demo opening stock",
                    )
