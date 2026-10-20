import os

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.models import User
from apps.catalog.models import Category, Product, TaxRule, Variant
from apps.customers.models import Customer
from apps.inventory.models import StockMovement
from apps.sales.models import InvoiceCounter, Sale
from apps.store import demo_catalogue, seed_data
from config.settings.base import PRODUCTION_SETTINGS
from apps.store.models import StoreSettings
from apps.suppliers.models import Supplier

PHOTO_DIR = demo_catalogue.PHOTO_DIR


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
        demo_catalogue.load_catalogue(actor=User.objects.filter(role="admin").first(), photo_dir=PHOTO_DIR)
        demo_catalogue.load_suppliers()
        for name, phone in seed_data.CUSTOMERS:
            Customer.objects.create(name=name, phone=phone)

        self.stdout.write(self.style.SUCCESS("Demo store loaded."))
        self.stdout.write(f"All demo accounts use the password: {password}")
        for full_name, email, role, pin in seed_data.STAFF:
            pin_note = f" - approval PIN {pin}" if pin else ""
            self.stdout.write(f"  {email:<26} {role}{pin_note}")

    def _refresh_photos(self):
        for code, name, _cat, sku, *_rest in seed_data.PRODUCTS:
            product = Product.objects.filter(sku=sku).first()
            if product is None:
                self.stdout.write(f"{code} {name}: not in this database, skipped")
            elif demo_catalogue.attach_photo(product, code, PHOTO_DIR):
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
