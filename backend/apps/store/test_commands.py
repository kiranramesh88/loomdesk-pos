"""Management commands for setting up a real store, and the guard that keeps demo data out of production."""

import io

import pytest
from django.core.files.base import ContentFile
from django.core.management import CommandError, call_command
from PIL import Image

from apps.accounts.models import Role, User
from apps.catalog.models import Category, Product, TaxRule
from apps.store.management.commands import seed_demo
from apps.store.models import StoreSettings
from apps.store.reference import ensure_reference_data

pytestmark = pytest.mark.django_db


def test_setup_store_creates_reference_data_only_and_can_rerun():
    call_command("setup_store", "--name", "Loom & Linen Kochi", "--code", "LL-KOC-01", stdout=io.StringIO())
    call_command("setup_store", stdout=io.StringIO())
    store = StoreSettings.load()
    assert (store.name, store.code) == ("Loom & Linen Kochi", "LL-KOC-01")
    assert TaxRule.objects.count() == 2
    assert Category.objects.count() == 6
    # Nothing demo-only: no products and no accounts.
    assert not Product.objects.exists()
    assert not User.objects.exists()


def test_setup_store_keeps_existing_edits():
    call_command("setup_store", stdout=io.StringIO())
    shirts = Category.objects.get(name="Shirts")
    shirts.hsn_code = "6105"
    shirts.save()
    call_command("setup_store", stdout=io.StringIO())
    assert Category.objects.get(name="Shirts").hsn_code == "6105"


def test_setup_store_names_receipt_details_still_at_the_demo_values():
    out = io.StringIO()
    call_command("setup_store", "--name", "Loom & Linen Kochi", "--code", "LL-KOC-01", stdout=out)
    assert "Still the demo store's address. Set it with --address before the first sale." in out.getvalue()
    assert "No GSTIN set" in out.getvalue()

    out = io.StringIO()
    call_command("setup_store", "--address", "MG Road, Kochi", "--gstin", "32ABCDE1234F1Z5", stdout=out)
    assert "demo store" not in out.getvalue()
    assert "No GSTIN set" not in out.getvalue()


def _create_staff(monkeypatch, *args, password="Kochi-Till-2026!", pin=None):
    monkeypatch.setenv("STAFF_PASSWORD", password)
    extra = ["--password-env", "STAFF_PASSWORD"]
    if pin is not None:
        monkeypatch.setenv("STAFF_PIN", pin)
        extra += ["--pin-env", "STAFF_PIN"]
    call_command("create_staff", *args, *extra, stdout=io.StringIO())


def test_create_staff_makes_an_account_with_its_own_password_and_pin(monkeypatch):
    _create_staff(monkeypatch, "--email", "Owner@Shop.example", "--name", "Store Owner", "--role", "admin", pin="482613")
    user = User.objects.get()
    assert user.email == "owner@shop.example"
    assert user.role == Role.ADMIN
    assert user.check_password("Kochi-Till-2026!")
    assert user.check_approval_pin("482613")
    assert not user.is_superuser


@pytest.mark.parametrize(
    ("args", "password", "pin", "message"),
    [
        (["--role", "admin"], "loomdesk-demo", None, "published demo password"),
        (["--role", "admin"], "password", None, "too common"),
        (["--role", "cashier"], "Kochi-Till-2026!", "1234", "don't get a PIN"),
        (["--role", "admin"], "Kochi-Till-2026!", "12", "4–6 digits"),
    ],
)
def test_create_staff_refuses_unsafe_accounts(monkeypatch, args, password, pin, message):
    with pytest.raises(CommandError, match=message):
        _create_staff(monkeypatch, "--email", "a@shop.example", "--name", "A Person", *args, password=password, pin=pin)
    assert not User.objects.exists()


def test_create_staff_refuses_a_duplicate_email(monkeypatch):
    _create_staff(monkeypatch, "--email", "a@shop.example", "--name", "A", "--role", "cashier")
    with pytest.raises(CommandError, match="already exists"):
        _create_staff(monkeypatch, "--email", "A@shop.example", "--name", "B", "--role", "cashier")


def test_create_staff_needs_the_password_variable_set(monkeypatch):
    monkeypatch.delenv("MISSING_PASSWORD", raising=False)
    with pytest.raises(CommandError, match="MISSING_PASSWORD"):
        call_command("create_staff", "--email", "a@shop.example", "--name", "A", "--role", "cashier", "--password-env", "MISSING_PASSWORD")


def test_seed_demo_refuses_production_settings(settings):
    settings.SETTINGS_MODULE = "config.settings.prod"
    for args in ([], ["--reset"], ["--refresh-photos"]):
        with pytest.raises(CommandError, match="refuses production settings"):
            call_command("seed_demo", *args, stdout=io.StringIO())
    assert not User.objects.exists()


def _jpeg(colour):
    buffer = io.BytesIO()
    Image.new("RGB", (8, 8), colour).save(buffer, "JPEG")
    return buffer.getvalue()


def test_refresh_photos_replaces_only_the_photos(monkeypatch, tmp_path, settings):
    settings.MEDIA_ROOT = tmp_path / "media"
    photos = tmp_path / "photos"
    photos.mkdir()
    (photos / "P-1001.jpg").write_bytes(_jpeg("blue"))
    monkeypatch.setattr(seed_demo, "PHOTO_DIR", photos)
    _, categories = ensure_reference_data()
    shirt = Product.objects.create(
        name="Classic Cotton Shirt", sku="SH-CT-001", category=categories["Shirts"], base_price_paise=1199_00, cost_price_paise=620_00
    )
    shirt.image.save("classic-cotton-shirt.jpg", ContentFile(_jpeg("red")), save=True)
    old = shirt.image.name

    out = io.StringIO()
    call_command("seed_demo", "--refresh-photos", stdout=out)

    shirt.refresh_from_db()
    assert shirt.image.name != old
    assert not shirt.image.storage.exists(old)
    with Image.open(shirt.image.path) as img:
        assert img.getpixel((4, 4))[2] > 150  # blue
    assert shirt.base_price_paise == 1199_00
    assert "P-1001 Classic Cotton Shirt: photo replaced" in out.getvalue()
    assert "P-1002 Everyday Linen Kurta: not in this database" in out.getvalue()
