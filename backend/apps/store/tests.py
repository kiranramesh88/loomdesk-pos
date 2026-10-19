import pytest
from django.core.management import call_command
from django.db.models import Sum

from apps.accounts.models import User
from apps.catalog.models import Product, Variant
from apps.inventory.models import StockMovement
from apps.store.management.commands.seed_demo import ean13, split_stock
from apps.store.seed_data import PRODUCTS


def test_ean13_check_digit():
    assert ean13("400638133393") == "4006381333931"


def test_split_stock_preserves_total():
    assert split_stock(7, 3) == [3, 2, 2]
    assert sum(split_stock(26, 12)) == 26


@pytest.mark.django_db
def test_seed_demo_builds_consistent_store():
    call_command("seed_demo")
    assert Product.objects.count() == len(PRODUCTS)
    # Every unit of opening stock is backed by a movement.
    expected = sum(p[6] for p in PRODUCTS)
    assert Variant.objects.aggregate(total=Sum("on_hand"))["total"] == expected
    assert StockMovement.objects.aggregate(total=Sum("quantity_delta"))["total"] == expected
    assert User.objects.get(email="rahul@loomlinen.demo").check_approval_pin("4826")
    assert Variant.objects.filter(barcode__isnull=True).count() == 0
