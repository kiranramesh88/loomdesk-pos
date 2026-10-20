"""Inventory API: stock list, summary, adjustments and movement history (Phase 6)."""

import datetime as dt
import threading
from unittest import mock
from zoneinfo import ZoneInfo

import pytest
from django.db import connection
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.catalog.models import Category, Product, TaxRule, Variant
from apps.inventory import services
from apps.inventory.models import StockMovement
from apps.inventory.services import record_movement

BASE = "/api/v1/inventory/"
VARIANTS = BASE + "variants/"
SUMMARY = BASE + "summary/"
MOVEMENTS = BASE + "movements/"
ADJUST = BASE + "adjustments/"
STORE_TZ = ZoneInfo("Asia/Kolkata")


def _user(role, email=None):
    return User.objects.create_user(email=email or f"{role}@example.com", password="x", full_name=f"Test {role}".title(), role=role)


def _client(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.fixture
def admin(db):
    return _user(Role.ADMIN)


@pytest.fixture
def api(admin):
    return _client(admin)


@pytest.fixture
def catalogue(db):
    """Shirts: M (8, reorder 2), L (2: low), XL (0: out). Towel: one variant (5). Old jacket: inactive product."""
    rule = TaxRule.objects.create(name="Flat 5", kind="flat", flat_rate_bp=500)
    shirts = Category.objects.create(name="Shirts", slug="shirts", hsn_code="6205", tax_rule=rule)
    linen = Category.objects.create(name="Home linen", slug="home-linen", hsn_code="6302", tax_rule=rule)

    def variant(product, size, stock, **fields):
        v = Variant.objects.create(product=product, size=size, colour="Blue", sku=f"{product.sku}-{size}", reorder_level=2, **fields)
        if stock:
            record_movement(variant=v, type=StockMovement.Type.OPENING, quantity_delta=stock)
        return v

    shirt = Product.objects.create(name="Classic Cotton Shirt", sku="SH-CT-001", category=shirts, base_price_paise=1199_00, cost_price_paise=620_00)
    towel = Product.objects.create(name="Soft Cotton Towel", sku="HL-TW-001", category=linen, base_price_paise=449_00)
    jacket = Product.objects.create(name="Old Jacket", sku="JK-OLD-001", category=shirts, base_price_paise=3000_00, status=Product.Status.INACTIVE)
    return {
        "m": variant(shirt, "M", 8, barcode="8901000010018"),
        "l": variant(shirt, "L", 2),
        "xl": variant(shirt, "XL", 0),
        "towel": variant(towel, "STD", 5),
        "jacket": variant(jacket, "L", 3),
    }


def _adjust(client, variant, kind, quantity, reason="Recount after delivery", expected=None):
    variant.refresh_from_db()
    return client.post(
        ADJUST,
        {
            "variant": variant.pk,
            "kind": kind,
            "quantity": quantity,
            "reason": reason,
            "expected_on_hand": variant.on_hand if expected is None else expected,
        },
        format="json",
    )


def _on_hand(variant):
    variant.refresh_from_db()
    return variant.on_hand


def _skus(response):
    assert response.status_code == 200, response.json()
    return [row["sku"] for row in response.json()["results"]]


# --- Access ---


@pytest.mark.parametrize("method,url", [("get", VARIANTS), ("get", SUMMARY), ("get", MOVEMENTS), ("get", VARIANTS + "1/"), ("post", ADJUST)])
def test_inventory_needs_sign_in(db, method, url):
    response = getattr(APIClient(), method)(url, {}, format="json")
    assert response.status_code == 403
    assert response.json()["code"] == "not_authenticated"


@pytest.mark.parametrize("role", [Role.CASHIER, Role.SENIOR_CASHIER])
@pytest.mark.parametrize("method,url", [("get", VARIANTS), ("get", SUMMARY), ("get", MOVEMENTS), ("post", ADJUST)])
def test_inventory_is_admin_only(catalogue, role, method, url):
    client = _client(_user(role))
    response = getattr(client, method)(url, {}, format="json")
    assert response.status_code == 403
    assert response.json()["code"] == "permission_denied"


def test_cashier_cannot_adjust_stock_directly(catalogue):
    response = _adjust(_client(_user(Role.CASHIER)), catalogue["m"], "remove", 8)
    assert response.status_code == 403
    assert _on_hand(catalogue["m"]) == 8
    assert not StockMovement.objects.exclude(type=StockMovement.Type.OPENING).exists()


# --- Variant list ---


def test_variant_rows_show_stock_product_totals_and_last_movement(catalogue, api):
    rows = {row["sku"]: row for row in api.get(VARIANTS).json()["results"]}
    m = rows["SH-CT-001-M"]
    assert m["on_hand"] == 8 and m["reorder_level"] == 2 and m["stock_state"] == "in_stock" and m["sellable"] is True
    assert m["product"] == {
        "id": catalogue["m"].product_id, "name": "Classic Cotton Shirt", "sku": "SH-CT-001", "status": "active",
        "category": "Shirts", "image_url": None,
    }
    assert m["product_on_hand"] == 10  # M 8 + L 2 + XL 0
    assert m["last_movement_type"] == "opening" and m["last_movement_at"]
    assert (rows["SH-CT-001-L"]["stock_state"], rows["SH-CT-001-XL"]["stock_state"]) == ("low_stock", "out_of_stock")
    assert rows["SH-CT-001-XL"]["last_movement_type"] is None
    assert rows["JK-OLD-001-L"]["sellable"] is False
    # The inventory list is admin-only, but still never carries prices or costs.
    assert not any("price" in key or "cost" in key for key in m) and not any("cost" in key for key in m["product"])


def test_search_by_name_sku_and_exact_barcode(catalogue, api):
    assert _skus(api.get(VARIANTS, {"q": "towel"})) == ["HL-TW-001-STD"]
    assert _skus(api.get(VARIANTS, {"q": "sh-ct-001-l"})) == ["SH-CT-001-L"]
    assert _skus(api.get(VARIANTS, {"q": "8901000010018"})) == ["SH-CT-001-M"]
    assert _skus(api.get(VARIANTS, {"q": "89010000"})) == []
    assert len(_skus(api.get(VARIANTS, {"q": "SH-CT"}))) == 3


def test_filter_by_state_category_and_status(catalogue, api):
    assert _skus(api.get(VARIANTS, {"state": "low_stock"})) == ["SH-CT-001-L"]
    assert _skus(api.get(VARIANTS, {"state": "out_of_stock"})) == ["SH-CT-001-XL"]
    assert set(_skus(api.get(VARIANTS, {"state": "in_stock"}))) == {"SH-CT-001-M", "HL-TW-001-STD", "JK-OLD-001-L"}
    linen = Category.objects.get(slug="home-linen")
    assert _skus(api.get(VARIANTS, {"category": linen.pk})) == ["HL-TW-001-STD"]
    assert _skus(api.get(VARIANTS, {"status": "inactive"})) == ["JK-OLD-001-L"]
    Variant.objects.filter(pk=catalogue["towel"].pk).update(is_active=False)
    assert set(_skus(api.get(VARIANTS, {"status": "inactive"}))) == {"JK-OLD-001-L", "HL-TW-001-STD"}
    assert "JK-OLD-001-L" not in _skus(api.get(VARIANTS, {"status": "active"}))
    assert api.get(VARIANTS, {"state": "nearly"}).status_code == 400


def test_low_stock_follows_each_variants_reorder_level(catalogue, api):
    Variant.objects.filter(pk=catalogue["m"].pk).update(reorder_level=10)
    assert set(_skus(api.get(VARIANTS, {"state": "low_stock"}))) == {"SH-CT-001-M", "SH-CT-001-L"}


def test_ordering_and_pagination_are_stable(catalogue, api):
    assert _skus(api.get(VARIANTS, {"ordering": "stock"}))[:2] == ["SH-CT-001-XL", "SH-CT-001-L"]
    assert _skus(api.get(VARIANTS, {"ordering": "-stock"}))[0] == "SH-CT-001-M"
    first = api.get(VARIANTS, {"page_size": 2}).json()
    second = api.get(VARIANTS, {"page_size": 2, "page": 2}).json()
    third = api.get(VARIANTS, {"page_size": 2, "page": 3}).json()
    seen = [r["sku"] for page in (first, second, third) for r in page["results"]]
    assert first["count"] == 5 and len(seen) == 5 and len(set(seen)) == 5
    assert api.get(VARIANTS, {"page_size": 2, "page": 4}).status_code == 404


def test_variant_detail_and_unknown_variant(catalogue, api):
    assert api.get(f"{VARIANTS}{catalogue['l'].pk}/").json()["stock_state"] == "low_stock"
    assert api.get(f"{VARIANTS}999999/").status_code == 404


def test_summary_counts_only_sellable_variants(catalogue, api):
    assert api.get(SUMMARY).json() == {"tracked_variants": 4, "low_stock": 1, "out_of_stock": 1, "units_on_hand": 15}


# --- Adjustments ---


def test_add_remove_and_count_record_one_movement_each(catalogue, api, admin):
    m = catalogue["m"]
    added = _adjust(api, m, "add", 4, reason="Found in back room")
    assert added.status_code == 201, added.json()
    body = added.json()
    assert body["variant"]["on_hand"] == 12
    assert {k: body["movement"][k] for k in ("type", "quantity_delta", "balance_after", "reason", "actor_name")} == {
        "type": "adjust_add", "quantity_delta": 4, "balance_after": 12, "reason": "Found in back room", "actor_name": "Test Admin",
    }
    assert _adjust(api, m, "remove", 3, reason="Damaged in storage").json()["movement"]["quantity_delta"] == -3
    counted = _adjust(api, m, "count", 7, reason="Monthly count").json()
    assert (counted["movement"]["type"], counted["movement"]["quantity_delta"], counted["variant"]["on_hand"]) == ("count", -2, 7)
    movements = list(m.movements.order_by("id").values_list("type", "quantity_delta", "balance_after", "actor_id"))
    assert movements == [("opening", 8, 8, None), ("adjust_add", 4, 12, admin.pk), ("adjust_remove", -3, 9, admin.pk), ("count", -2, 7, admin.pk)]
    assert _on_hand(m) == 7


def test_count_matching_stock_records_a_zero_change(catalogue, api):
    response = _adjust(api, catalogue["l"], "count", 2, reason="Shelf count")
    assert response.status_code == 201
    assert (response.json()["movement"]["quantity_delta"], _on_hand(catalogue["l"])) == (0, 2)


def test_stock_can_never_go_negative(catalogue, api):
    l = catalogue["l"]
    response = _adjust(api, l, "remove", 3, reason="Damaged")
    assert response.status_code == 400
    assert response.json()["fields"] == {"quantity": ["Only 2 in stock; stock cannot go negative."]}
    assert _on_hand(l) == 2 and l.movements.count() == 1


@pytest.mark.parametrize(
    "kind,quantity,reason,field",
    [
        ("add", 0, "Delivery", "quantity"),
        ("remove", 0, "Damaged", "quantity"),
        ("add", -1, "Delivery", "quantity"),
        ("count", -5, "Count", "quantity"),
        ("add", 10_001, "Delivery", "quantity"),
        ("add", 2, "", "reason"),
        ("remove", 1, "  ", "reason"),
        ("count", 4, "ok", "reason"),
        ("discard", 1, "Damaged", "kind"),
    ],
)
def test_invalid_adjustments_change_nothing(catalogue, api, kind, quantity, reason, field):
    response = _adjust(api, catalogue["m"], kind, quantity, reason=reason)
    assert response.status_code == 400
    assert field in response.json()["fields"]
    assert _on_hand(catalogue["m"]) == 8 and catalogue["m"].movements.count() == 1


def test_unknown_variant_and_fractional_quantity_are_rejected(catalogue, api):
    body = {"variant": 999999, "kind": "add", "quantity": 1, "reason": "Delivery", "expected_on_hand": 0}
    assert "variant" in api.post(ADJUST, body, format="json").json()["fields"]
    body = {**body, "variant": catalogue["m"].pk, "quantity": 1.5, "expected_on_hand": 8}
    assert "quantity" in api.post(ADJUST, body, format="json").json()["fields"]
    assert _on_hand(catalogue["m"]) == 8


def test_stock_changed_since_preview_is_refused(catalogue, api):
    m = catalogue["m"]
    # A sale takes a unit after the admin opened the adjustment at 8.
    record_movement(variant=m, type=StockMovement.Type.SALE, quantity_delta=-1, reference="LD-000001")
    response = _adjust(api, m, "count", 8, reason="Count", expected=8)
    assert response.status_code == 409
    assert response.json()["code"] == "stock_changed"
    assert "from 8 to 7" in response.json()["detail"]
    assert _on_hand(m) == 7 and m.movements.count() == 2


def test_inactive_items_can_still_be_written_off(catalogue, api):
    response = _adjust(api, catalogue["jacket"], "remove", 3, reason="Written off: discontinued")
    assert response.status_code == 201
    assert _on_hand(catalogue["jacket"]) == 0


def test_failed_write_rolls_back_the_whole_adjustment(catalogue, admin):
    m = catalogue["m"]
    with mock.patch.object(StockMovement.objects, "create", side_effect=RuntimeError("disk full")):
        with pytest.raises(RuntimeError):
            services.adjust_stock(variant=m, kind="remove", quantity=3, reason="Damaged", expected_on_hand=8, actor=admin)
    assert _on_hand(m) == 8 and m.movements.count() == 1


def test_adjusting_keeps_earlier_history(catalogue, api):
    m = catalogue["m"]
    record_movement(variant=m, type=StockMovement.Type.SALE, quantity_delta=-2, reference="LD-000001")
    before = list(m.movements.order_by("id").values())
    _adjust(api, m, "count", 3, reason="Count")
    after = list(m.movements.order_by("id").values())
    assert after[: len(before)] == before and len(after) == len(before) + 1


# --- Movement history ---


def test_movement_history_lists_type_change_reference_actor_and_reason(catalogue, api, admin):
    m = catalogue["m"]
    record_movement(variant=m, type=StockMovement.Type.SALE, quantity_delta=-1, reference="LD-000042", actor=admin)
    _adjust(api, m, "remove", 2, reason="Water damage")
    rows = api.get(MOVEMENTS, {"variant": m.pk}).json()["results"]
    assert [(r["type"], r["quantity_delta"], r["balance_after"]) for r in rows] == [
        ("adjust_remove", -2, 5), ("sale", -1, 7), ("opening", 8, 8),
    ]
    assert rows[0]["reason"] == "Water damage" and rows[0]["actor_name"] == "Test Admin"
    assert rows[1]["reference"] == "LD-000042" and rows[1]["type_label"] == "Sale"
    assert rows[2]["actor_name"] is None
    assert rows[0]["variant"] == {
        "id": m.pk, "sku": "SH-CT-001-M", "size": "M", "colour": "Blue", "product_id": m.product_id, "product_name": "Classic Cotton Shirt",
    }


def test_movement_filters_and_pagination(catalogue, api):
    m = catalogue["m"]
    sale = record_movement(variant=m, type=StockMovement.Type.SALE, quantity_delta=-1, reference="LD-000042")
    StockMovement.objects.filter(pk=sale.pk).update(created_at=dt.datetime(2026, 10, 18, 23, 30, tzinfo=STORE_TZ))
    assert [r["id"] for r in api.get(MOVEMENTS, {"type": "sale"}).json()["results"]] == [sale.pk]
    assert [r["id"] for r in api.get(MOVEMENTS, {"q": "ld-000042"}).json()["results"]] == [sale.pk]
    assert [r["id"] for r in api.get(MOVEMENTS, {"date_from": "2026-10-18", "date_to": "2026-10-18"}).json()["results"]] == [sale.pk]
    assert api.get(MOVEMENTS, {"q": "towel"}).json()["count"] == 1
    assert api.get(MOVEMENTS, {"date_from": "2026-10-20", "date_to": "2026-10-01"}).status_code == 400
    assert api.get(MOVEMENTS, {"type": "teleport"}).status_code == 400
    page = api.get(MOVEMENTS, {"page_size": 2}).json()
    assert page["count"] == 5 and len(page["results"]) == 2


def test_movements_and_adjustments_are_append_only(catalogue, api):
    for method in ("put", "patch", "delete"):
        assert getattr(api, method)(MOVEMENTS, {}, format="json").status_code == 405
        assert getattr(api, method)(f"{VARIANTS}{catalogue['m'].pk}/", {}, format="json").status_code == 405
    assert api.get(ADJUST).status_code == 405
    assert api.post(MOVEMENTS, {}, format="json").status_code == 405


@pytest.mark.skipif(connection.vendor != "postgresql", reason="Needs Postgres row locks and real concurrent connections")
@pytest.mark.django_db(transaction=True)
def test_concurrent_removals_of_the_last_units():
    rule = TaxRule.objects.create(name="Flat", kind="flat", flat_rate_bp=500)
    category = Category.objects.create(name="Shirts", slug="shirts", hsn_code="6205", tax_rule=rule)
    product = Product.objects.create(name="Shirt", sku="SH-1", category=category, base_price_paise=1000_00)
    variant = Variant.objects.create(product=product, size="M", colour="Blue", sku="SH-1-M")
    record_movement(variant=variant, type=StockMovement.Type.OPENING, quantity_delta=2)
    admins = [_user(Role.ADMIN, email=f"a{i}@example.com") for i in range(4)]
    barrier = threading.Barrier(len(admins))
    statuses = []

    def attempt(user):
        barrier.wait()
        response = _client(user).post(
            ADJUST, {"variant": variant.pk, "kind": "remove", "quantity": 2, "reason": "Damaged", "expected_on_hand": 2}, format="json"
        )
        statuses.append(response.status_code)
        connection.close()

    threads = [threading.Thread(target=attempt, args=(user,)) for user in admins]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    # One removal wins; the rest see that stock moved since their preview.
    assert sorted(statuses) == [201, 409, 409, 409]
    assert _on_hand(variant) == 0
    assert variant.movements.filter(type=StockMovement.Type.ADJUST_REMOVE).count() == 1
