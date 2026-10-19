import pytest
from django.core.management import call_command
from django.db.models import Sum

from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.catalog.models import Product, Variant
from apps.inventory.models import StockMovement
from apps.store.management.commands.seed_demo import ean13, split_stock
from apps.store.models import StoreSettings
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


@pytest.fixture
def store(db):
    store = StoreSettings.load()
    store.name, store.code, store.state, store.gstin = "Loom & Linen", "LL-KKD-01", "Kerala", "32ABCDE1234F1Z5"
    store.save()
    return store


def _client_as(role):
    user = User.objects.create_user(email=f"{role}@example.com", password="x", full_name="Test User", role=role)
    client = APIClient()
    client.force_authenticate(user)
    return client


def test_store_returns_identity_only_to_admins(store):
    response = _client_as(Role.ADMIN).get("/api/v1/store/")
    assert response.status_code == 200
    # Only identity; tax and discount settings stay out of this endpoint.
    assert response.json() == {"name": "Loom & Linen", "code": "LL-KKD-01", "state": "Kerala"}


def test_store_requires_authentication(store):
    response = APIClient().get("/api/v1/store/")
    assert response.status_code == 403
    assert response.json()["code"] == "not_authenticated"


@pytest.mark.parametrize("role", [Role.SENIOR_CASHIER, Role.CASHIER])
def test_store_is_forbidden_for_non_admins(store, role):
    response = _client_as(role).get("/api/v1/store/")
    assert response.status_code == 403
    assert response.json()["code"] == "permission_denied"


def test_store_is_read_only(store):
    client = _client_as(Role.ADMIN)
    assert client.patch("/api/v1/store/", {"name": "Changed"}, format="json").status_code == 405
    store.refresh_from_db()
    assert store.name == "Loom & Linen"
