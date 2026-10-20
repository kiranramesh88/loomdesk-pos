"""Billing: staff catalogue, pricing and GST, checkout integrity, idempotency, stock and receipts."""

import threading
import time
import uuid
from unittest import mock

import pytest
from datetime import timedelta

from django.db import connection
from django.db.models import F
from rest_framework.test import APIClient

from apps.accounts.models import AttemptGuard, Role, User
from apps.catalog.models import Category, Product, TaxRule, Variant
from apps.inventory.models import StockMovement
from apps.inventory.services import record_movement
from apps.sales import services
from apps.sales.models import InvoiceCounter, Payment, Sale, SaleLine
from apps.sales.pricing import allocate, price_bill
from apps.store.models import StoreSettings

PRODUCTS_URL = "/api/v1/billing/products/"
QUOTE_URL = "/api/v1/sales/quote/"
SALES_URL = "/api/v1/sales/"


def _user(role, email=None, pin=None):
    user = User.objects.create_user(
        email=email or f"{role}@example.com", password="x", full_name=f"Test {role}".title(), role=role
    )
    if pin:
        user.set_approval_pin(pin)
        user.save()
    return user


def _client(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.fixture
def cashier(db):
    return _user(Role.CASHIER)


@pytest.fixture
def senior(db):
    return _user(Role.SENIOR_CASHIER, pin="4826")


@pytest.fixture
def garments(db):
    return TaxRule.objects.create(
        name="Garments", kind="price_band", threshold_paise=2_500_00, lower_rate_bp=500, upper_rate_bp=1800
    )


@pytest.fixture
def shirts(garments):
    return Category.objects.create(name="Shirts", slug="shirts", hsn_code="6205", tax_rule=garments)


def _product(category, name="Classic Cotton Shirt", sku="SH-CT-001", price=1199_00, **fields):
    return Product.objects.create(
        name=name, sku=sku, category=category, base_price_paise=price, cost_price_paise=620_00, **fields
    )


def _variant(product, size="M", colour="Blue", stock=5, **fields):
    variant = Variant.objects.create(
        product=product, size=size, colour=colour, sku=f"{product.sku}-{size}-{colour[:3].upper()}", **fields
    )
    if stock:
        record_movement(variant=variant, type=StockMovement.Type.OPENING, quantity_delta=stock)
    return variant


@pytest.fixture
def shirt(shirts):
    return _variant(_product(shirts), barcode="8901000010018")


@pytest.fixture
def jacket(shirts):
    # ₹3,000 a unit: above the ₹2,500 threshold, so 18% unless a discount brings it down.
    return _variant(_product(shirts, name="Linen Jacket", sku="JK-LN-001", price=3000_00), size="L", stock=3)


def _checkout(client, lines, total, payment=None, key=None, **extra):
    body = {
        "lines": [{"variant": v.pk, "quantity": q} for v, q in lines],
        "payment": payment or {"method": "cash", "tendered_paise": total},
        "expected_total_paise": total,
        **extra,
    }
    return client.post(SALES_URL, body, format="json", HTTP_IDEMPOTENCY_KEY=str(key or uuid.uuid4()))


def _fields(response):
    assert response.status_code == 400, response.json()
    return response.json()["fields"]


def _on_hand(variant):
    variant.refresh_from_db()
    return variant.on_hand


# --- Access ---


@pytest.mark.parametrize(
    "method,url",
    [
        ("get", PRODUCTS_URL),
        ("get", "/api/v1/billing/categories/"),
        ("get", "/api/v1/billing/approvers/"),
        ("get", "/api/v1/billing/settings/"),
        ("post", QUOTE_URL),
        ("post", SALES_URL),
        ("get", SALES_URL + "LD-000001/"),
    ],
)
def test_billing_endpoints_need_sign_in(db, method, url):
    response = getattr(APIClient(), method)(url, {}, format="json")
    assert response.status_code == 403
    assert response.json()["code"] == "not_authenticated"


@pytest.mark.parametrize("role", [Role.CASHIER, Role.SENIOR_CASHIER, Role.ADMIN])
def test_every_staff_role_can_bill(shirt, role):
    client = _client(_user(role))
    assert client.get(PRODUCTS_URL).status_code == 200
    assert _checkout(client, [(shirt, 1)], 1258_95).status_code == 201


def test_cashier_still_cannot_use_admin_catalogue(cashier):
    response = _client(cashier).get("/api/v1/catalog/products/")
    assert response.status_code == 403
    assert response.json()["code"] == "permission_denied"


def test_deactivated_account_is_signed_out_of_billing(shirt, cashier):
    client = APIClient()
    client.force_login(cashier)
    cashier.is_active = False
    cashier.save()
    assert client.get(PRODUCTS_URL).status_code == 403


# --- Staff catalogue ---


def test_staff_catalogue_returns_only_till_fields(shirt, cashier):
    body = _client(cashier).get(PRODUCTS_URL).json()
    product = body["results"][0]
    assert set(product) == {"id", "name", "sku", "category", "image_url", "hsn_code", "tax_rule", "variants"}
    assert "cost_price_paise" not in str(body)
    assert product["hsn_code"] == "6205"
    assert product["tax_rule"]["summary"] == "5% up to ₹2,500 per unit, 18% above"
    assert product["variants"] == [
        {
            "id": shirt.pk, "sku": "SH-CT-001-M-BLU", "size": "M", "colour": "Blue", "barcode": "8901000010018",
            "price_paise": 1199_00, "on_hand": 5, "stock_state": "in_stock",
        }
    ]


def test_staff_catalogue_hides_inactive_products_and_variants(shirts, cashier):
    live = _product(shirts)
    _variant(live, size="M")
    _variant(live, size="L", is_active=False)
    hidden = _product(shirts, name="Retired Shirt", sku="SH-RT-001", status=Product.Status.INACTIVE)
    _variant(hidden)
    only_inactive_variants = _product(shirts, name="Empty Shirt", sku="SH-EM-001")
    _variant(only_inactive_variants, is_active=False)

    results = _client(cashier).get(PRODUCTS_URL).json()["results"]
    assert [p["name"] for p in results] == ["Classic Cotton Shirt"]
    assert [v["size"] for v in results[0]["variants"]] == ["M"]


def test_staff_catalogue_keeps_out_of_stock_variants_visible(shirts, cashier):
    _variant(_product(shirts), stock=0)
    variant = _client(cashier).get(PRODUCTS_URL).json()["results"][0]["variants"][0]
    assert (variant["on_hand"], variant["stock_state"]) == (0, "out_of_stock")


@pytest.mark.parametrize(
    "query,found",
    [("cotton", True), ("sh-ct", True), ("SH-CT-001-M", True), ("8901000010018", True), ("890100001", False), ("silk", False)],
)
def test_staff_catalogue_search(shirt, cashier, query, found):
    results = _client(cashier).get(PRODUCTS_URL, {"q": query}).json()["results"]
    assert bool(results) is found


def test_staff_catalogue_barcode_of_inactive_variant_finds_nothing(shirts, cashier):
    product = _product(shirts)
    _variant(product, size="M")
    _variant(product, size="L", barcode="4006381333931", is_active=False)
    assert _client(cashier).get(PRODUCTS_URL, {"q": "4006381333931"}).json()["results"] == []


def test_staff_catalogue_category_filter(shirts, garments, cashier):
    sarees = Category.objects.create(name="Sarees", slug="sarees", hsn_code="5208", tax_rule=garments)
    _variant(_product(shirts))
    _variant(_product(sarees, name="Kasavu Saree", sku="SR-KS-001"))
    results = _client(cashier).get(PRODUCTS_URL, {"category": sarees.pk}).json()["results"]
    assert [p["name"] for p in results] == ["Kasavu Saree"]
    categories = _client(cashier).get("/api/v1/billing/categories/").json()
    assert {c["name"] for c in categories} == {"Shirts", "Sarees"}


def test_billing_settings_expose_only_till_facts(cashier):
    assert _client(cashier).get("/api/v1/billing/settings/").json() == {
        "store_name": "Loom & Linen", "store_code": "LL-KKD-01", "prices_include_tax": False, "cashier_discount_limit_pct": 10,
    }


def test_approver_list_shows_only_pin_holders(cashier, senior):
    _user(Role.ADMIN)  # no PIN set: can't approve at the till
    approvers = _client(cashier).get("/api/v1/billing/approvers/").json()
    assert approvers == [{"id": senior.pk, "full_name": senior.full_name, "role": "senior_cashier"}]


# --- Pricing ---


def test_allocate_shares_proportionally_and_gives_remainder_to_largest_line():
    assert allocate(100, [1, 1, 1]) == [34, 33, 33]
    assert allocate(1000, [3000, 1000]) == [750, 250]
    assert allocate(1, [100, 300]) == [0, 1]
    assert sum(allocate(99_999, [123_45, 678_90, 1_11])) == 99_999
    assert allocate(0, [1, 2]) == [0, 0]


def test_quote_adds_gst_on_tax_exclusive_prices(shirt, jacket, cashier):
    response = _client(cashier).post(
        QUOTE_URL, {"lines": [{"variant": shirt.pk, "quantity": 2}, {"variant": jacket.pk, "quantity": 1}]}, format="json"
    )
    body = response.json()
    assert response.status_code == 200, body
    shirt_line, jacket_line = body["lines"]
    assert (shirt_line["subtotal_paise"], shirt_line["tax_rate_bp"], shirt_line["tax_paise"]) == (2398_00, 500, 119_90)
    assert (jacket_line["subtotal_paise"], jacket_line["tax_rate_bp"], jacket_line["tax_paise"]) == (3000_00, 1800, 540_00)
    assert body["subtotal_paise"] == 5398_00
    assert body["taxable_paise"] == 5398_00
    assert body["tax_paise"] == 659_90
    assert body["total_paise"] == 6057_90
    assert body["prices_include_tax"] is False
    assert body["tax_breakdown"] == [
        {"rate_bp": 500, "taxable_paise": 2398_00, "tax_paise": 119_90, "cgst_paise": 59_95, "sgst_paise": 59_95},
        {"rate_bp": 1800, "taxable_paise": 3000_00, "tax_paise": 540_00, "cgst_paise": 270_00, "sgst_paise": 270_00},
    ]
    assert (shirt_line["on_hand"], jacket_line["on_hand"]) == (5, 3)
    assert body["discount_limit_paise"] == 539_80
    assert body["needs_approval"] is False


def test_slab_is_chosen_per_unit_after_the_discount(jacket, senior):
    # ₹3,000 jacket with ₹600 off: ₹2,400 a unit after discount, so the 5% slab applies.
    body = _client(senior).post(
        QUOTE_URL, {"lines": [{"variant": jacket.pk, "quantity": 2}], "discount": {"kind": "amount", "value": 1200_00}},
        format="json",
    ).json()
    line = body["lines"][0]
    assert (line["discount_paise"], line["taxable_paise"], line["tax_rate_bp"], line["tax_paise"]) == (
        1200_00, 4800_00, 500, 240_00,
    )
    assert body["total_paise"] == 5040_00


def test_bill_discount_is_shared_by_line_value(shirt, jacket, senior):
    body = _client(senior).post(
        QUOTE_URL,
        {
            "lines": [{"variant": shirt.pk, "quantity": 1}, {"variant": jacket.pk, "quantity": 1}],
            "discount": {"kind": "percent", "value": 1000},
        },
        format="json",
    ).json()
    shirt_line, jacket_line = body["lines"]
    assert body["discount_paise"] == 419_90
    assert shirt_line["discount_paise"] + jacket_line["discount_paise"] == 419_90
    assert (shirt_line["discount_paise"], jacket_line["discount_paise"]) == (119_90, 300_00)
    # ₹2,700 a unit after discount is still above the threshold.
    assert jacket_line["tax_rate_bp"] == 1800


def test_flat_rate_rule_and_product_override(shirts, cashier):
    flat = TaxRule.objects.create(name="Accessories", kind="flat", flat_rate_bp=1200)
    belt = _variant(_product(shirts, name="Leather Belt", sku="BL-LT-001", price=899_00, tax_rule=flat, hsn_code="4203"))
    line = _client(cashier).post(QUOTE_URL, {"lines": [{"variant": belt.pk, "quantity": 1}]}, format="json").json()["lines"][0]
    assert (line["tax_rate_bp"], line["tax_paise"]) == (1200, 107_88)


def test_tax_inclusive_prices_extract_gst(shirt, jacket):
    shirt = Variant.objects.select_related("product__category__tax_rule").get(pk=shirt.pk)
    jacket = Variant.objects.select_related("product__category__tax_rule").get(pk=jacket.pk)
    bill = price_bill([(shirt, 1), (jacket, 1)], 0, prices_include_tax=True)
    shirt_line, jacket_line = bill.lines
    # ₹1,199 inclusive of 5%: taxable 1141.90, tax 57.10.
    assert (shirt_line.taxable_paise, shirt_line.tax_paise, shirt_line.total_paise) == (1141_90, 57_10, 1199_00)
    # ₹3,000 inclusive is ₹2,857 taxable at 5%, above the threshold, so 18%: taxable 2542.37.
    assert (jacket_line.tax_rate_bp, jacket_line.taxable_paise, jacket_line.tax_paise) == (1800, 2542_37, 457_63)
    assert bill.total_paise == 4199_00


def test_quote_rejects_bad_quantities(shirt, cashier):
    client = _client(cashier)
    for quantity, message in [(0, "at least 1"), (-1, "at least 1"), (1000, "less than or equal to 999")]:
        fields = _fields(client.post(QUOTE_URL, {"lines": [{"variant": shirt.pk, "quantity": quantity}]}, format="json"))
        assert message in fields["lines.0.quantity"][0]
    assert "lines.0.quantity" in _fields(
        client.post(QUOTE_URL, {"lines": [{"variant": shirt.pk, "quantity": "two"}]}, format="json")
    )
    assert "lines" in _fields(client.post(QUOTE_URL, {"lines": []}, format="json"))


def test_quote_reports_stock_and_duplicates_per_line(shirt, jacket, cashier):
    fields = _fields(
        _client(cashier).post(
            QUOTE_URL,
            {"lines": [{"variant": shirt.pk, "quantity": 6}, {"variant": jacket.pk, "quantity": 1}, {"variant": shirt.pk, "quantity": 1}]},
            format="json",
        )
    )
    assert fields == {
        "lines.0.quantity": ["Only 5 left in stock."],
        "lines.2.variant": ["This variant is already on the bill. Change its quantity instead."],
    }


def test_quote_rejects_discount_above_subtotal(shirt, senior):
    client = _client(senior)
    fields = _fields(
        client.post(QUOTE_URL, {"lines": [{"variant": shirt.pk, "quantity": 1}], "discount": {"kind": "amount", "value": 1199_01}}, format="json")
    )
    assert fields == {"discount": ["The discount can’t be more than the bill subtotal."]}
    fields = _fields(
        client.post(QUOTE_URL, {"lines": [{"variant": shirt.pk, "quantity": 1}], "discount": {"kind": "percent", "value": 10_001}}, format="json")
    )
    assert "discount.value" in fields


# --- Checkout ---


def test_checkout_saves_sale_lines_payment_and_stock_together(shirt, jacket, cashier):
    response = _checkout(
        _client(cashier), [(shirt, 2), (jacket, 1)], 6057_90, payment={"method": "cash", "tendered_paise": 6100_00}
    )
    body = response.json()
    assert response.status_code == 201, body
    sale = Sale.objects.get()
    assert body["invoice_no"] == sale.invoice_no == "LD-000001"
    assert sale.cashier == cashier and body["cashier_name"] == "Test Cashier"
    assert (sale.subtotal_paise, sale.tax_paise, sale.total_paise) == (5398_00, 659_90, 6057_90)
    assert body["payment"] == {
        "method": "cash", "amount_paise": 6057_90, "tendered_paise": 6100_00, "change_paise": 42_10, "reference": "",
        "gateway_verified": False, "recorded_at": body["payment"]["recorded_at"],
    }
    assert (_on_hand(shirt), _on_hand(jacket)) == (3, 2)
    movements = StockMovement.objects.filter(type=StockMovement.Type.SALE).order_by("variant_id")
    assert [(m.variant_id, m.quantity_delta, m.reference, m.actor_id) for m in movements] == [
        (shirt.pk, -2, "LD-000001", cashier.pk),
        (jacket.pk, -1, "LD-000001", cashier.pk),
    ]


def test_invoice_numbers_are_sequential_and_unique(shirt, cashier):
    client = _client(cashier)
    numbers = [_checkout(client, [(shirt, 1)], 1258_95).json()["invoice_no"] for _ in range(3)]
    assert numbers == ["LD-000001", "LD-000002", "LD-000003"]


def test_checkout_ignores_client_prices_and_totals(shirt, cashier):
    body = {
        "lines": [{"variant": shirt.pk, "quantity": 1, "unit_price_paise": 1_00, "tax_paise": 0}],
        "payment": {"method": "cash", "tendered_paise": 1258_95},
        "expected_total_paise": 1258_95,
        "subtotal_paise": 1_00,
        "total_paise": 1_00,
    }
    response = _client(cashier).post(SALES_URL, body, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()))
    assert response.status_code == 201
    line = SaleLine.objects.get()
    assert (line.unit_price_paise, line.tax_paise, line.sale.total_paise) == (1199_00, 59_95, 1258_95)


def test_checkout_refuses_when_confirmed_total_differs(shirt, cashier):
    response = _checkout(_client(cashier), [(shirt, 1)], 1199_00)
    assert response.status_code == 409
    assert response.json()["code"] == "total_changed"
    assert "₹1,258.95" in response.json()["detail"]
    assert not Sale.objects.exists() and _on_hand(shirt) == 5


def test_price_change_after_quote_needs_reconfirmation(shirt, cashier):
    client = _client(cashier)
    total = client.post(QUOTE_URL, {"lines": [{"variant": shirt.pk, "quantity": 1}]}, format="json").json()["total_paise"]
    Product.objects.filter(pk=shirt.product_id).update(base_price_paise=1299_00)
    assert _checkout(client, [(shirt, 1)], total).status_code == 409


def test_checkout_needs_an_idempotency_key(shirt, cashier):
    body = {"lines": [{"variant": shirt.pk, "quantity": 1}], "payment": {"method": "cash", "tendered_paise": 1258_95}, "expected_total_paise": 1258_95}
    for header in ({}, {"HTTP_IDEMPOTENCY_KEY": "not-a-uuid"}):
        response = _client(cashier).post(SALES_URL, body, format="json", **header)
        assert _fields(response) == {"idempotency_key": ["Send a UUID Idempotency-Key header."]}
    assert not Sale.objects.exists()


def test_cash_below_total_is_refused(shirt, cashier):
    fields = _fields(_checkout(_client(cashier), [(shirt, 1)], 1258_95, payment={"method": "cash", "tendered_paise": 1258_94}))
    assert fields == {"payment.tendered_paise": ["The cash received is less than the total."]}
    fields = _fields(_checkout(_client(cashier), [(shirt, 1)], 1258_95, payment={"method": "cash"}))
    assert fields == {"payment.tendered_paise": ["Enter the cash received."]}
    assert not Sale.objects.exists() and _on_hand(shirt) == 5


@pytest.mark.parametrize("method,label", [("upi", "UPI transaction ID"), ("card", "card approval code")])
def test_upi_and_card_need_a_reference_and_are_not_gateway_verified(shirt, cashier, method, label):
    client = _client(cashier)
    fields = _fields(_checkout(client, [(shirt, 1)], 1258_95, payment={"method": method, "reference": "  "}))
    assert fields == {"payment.reference": [f"Enter the {label} shown on the confirmation."]}
    response = _checkout(client, [(shirt, 1)], 1258_95, payment={"method": method, "reference": "4318 2290", "tendered_paise": 5})
    payment = response.json()["payment"]
    assert response.status_code == 201
    assert (payment["reference"], payment["gateway_verified"], payment["tendered_paise"], payment["change_paise"]) == (
        "4318 2290", False, None, 0,
    )


def test_unknown_payment_method_is_refused(shirt, cashier):
    assert "payment.method" in _fields(_checkout(_client(cashier), [(shirt, 1)], 1258_95, payment={"method": "wallet"}))


def test_insufficient_stock_is_refused_without_side_effects(shirt, jacket, cashier):
    fields = _fields(_checkout(_client(cashier), [(shirt, 1), (jacket, 4)], 5000_00))
    assert fields == {"lines.1.quantity": ["Only 3 left in stock."]}
    assert not Sale.objects.exists()
    assert (_on_hand(shirt), _on_hand(jacket)) == (5, 3)
    assert not StockMovement.objects.filter(type=StockMovement.Type.SALE).exists()


@pytest.mark.parametrize("what", ["product", "variant"])
def test_deactivated_items_cannot_be_sold(shirt, cashier, what):
    client = _client(cashier)
    total = client.post(QUOTE_URL, {"lines": [{"variant": shirt.pk, "quantity": 1}]}, format="json").json()["total_paise"]
    if what == "product":
        Product.objects.filter(pk=shirt.product_id).update(status=Product.Status.INACTIVE)
    else:
        Variant.objects.filter(pk=shirt.pk).update(is_active=False)
    fields = _fields(_checkout(client, [(shirt, 1)], total))
    assert fields == {"lines.0.variant": ["This item is no longer sold. Remove it from the bill."]}
    assert not Sale.objects.exists() and _on_hand(shirt) == 5


def test_unknown_variant_is_refused(cashier, db):
    fields = _fields(
        _client(cashier).post(QUOTE_URL, {"lines": [{"variant": 999_999, "quantity": 1}]}, format="json")
    )
    assert fields == {"lines.0.variant": ["This item no longer exists. Remove it from the bill."]}


# --- Idempotency and integrity ---


def test_retry_with_same_key_returns_the_original_sale(shirt, cashier):
    client, key = _client(cashier), uuid.uuid4()
    first = _checkout(client, [(shirt, 2)], 2517_90, key=key)
    second = _checkout(client, [(shirt, 2)], 2517_90, key=key)
    assert (first.status_code, second.status_code) == (201, 200)
    assert first.json() == second.json()
    assert Sale.objects.count() == 1
    assert _on_hand(shirt) == 3  # deducted exactly once
    assert StockMovement.objects.filter(type=StockMovement.Type.SALE).count() == 1


def test_reusing_a_key_for_a_different_bill_is_refused(shirt, cashier):
    client, key = _client(cashier), uuid.uuid4()
    assert _checkout(client, [(shirt, 1)], 1258_95, key=key).status_code == 201
    response = _checkout(client, [(shirt, 2)], 2517_90, key=key)
    assert response.status_code == 409
    assert response.json()["code"] == "idempotency_key_reused"
    assert "already completed as LD-000001" in response.json()["detail"]
    assert Sale.objects.count() == 1 and _on_hand(shirt) == 4


def test_same_key_from_another_cashier_is_a_separate_checkout(shirt, cashier):
    key = uuid.uuid4()
    other = _user(Role.CASHIER, email="other@example.com")
    assert _checkout(_client(cashier), [(shirt, 1)], 1258_95, key=key).status_code == 201
    assert _checkout(_client(other), [(shirt, 1)], 1258_95, key=key).status_code == 201
    assert Sale.objects.count() == 2


def test_failed_checkout_leaves_key_usable(shirt, cashier):
    client, key = _client(cashier), uuid.uuid4()
    assert _checkout(client, [(shirt, 1)], 1258_95, key=key, payment={"method": "cash", "tendered_paise": 1}).status_code == 400
    assert _checkout(client, [(shirt, 1)], 1258_95, key=key).status_code == 201


def test_failure_midway_rolls_back_everything(shirt, jacket, cashier):
    real = record_movement
    calls = []

    def fail_on_second_line(**kwargs):
        calls.append(kwargs["variant"].pk)
        if len(calls) == 2:
            raise RuntimeError("disk full")
        return real(**kwargs)

    client = _client(cashier)
    client.raise_request_exception = False
    with mock.patch.object(services, "record_movement", side_effect=fail_on_second_line):
        response = _checkout(client, [(shirt, 1), (jacket, 1)], 4798_95)
    assert response.status_code == 500
    assert not Sale.objects.exists() and not SaleLine.objects.exists() and not Payment.objects.exists()
    assert (_on_hand(shirt), _on_hand(jacket)) == (5, 3)
    assert not StockMovement.objects.filter(type=StockMovement.Type.SALE).exists()
    # The invoice number rolled back too, so the next sale takes LD-000001 with no gap.
    assert not InvoiceCounter.objects.filter(last_number__gt=0).exists()
    assert _checkout(client, [(shirt, 1)], 1258_95).json()["invoice_no"] == "LD-000001"


def test_last_unit_sells_once(shirts, cashier):
    last = _variant(_product(shirts), stock=1)
    other = _user(Role.CASHIER, email="other@example.com")
    assert _checkout(_client(cashier), [(last, 1)], 1258_95).status_code == 201
    fields = _fields(_checkout(_client(other), [(last, 1)], 1258_95))
    assert fields == {"lines.0.quantity": ["Out of stock. Remove it from the bill."]}
    assert _on_hand(last) == 0 and Sale.objects.count() == 1


def test_stock_taken_after_the_check_still_cannot_go_negative(shirts, cashier):
    """If another till sold the last unit between the stock check and the deduction, the
    locked deduction refuses and the whole sale rolls back."""
    last = _variant(_product(shirts), stock=1)
    real_resolve = services.resolve_items

    def resolve_then_lose_the_race(lines, *, lock):
        items = real_resolve(lines, lock=lock)
        record_movement(variant=Variant.objects.get(pk=last.pk), type=StockMovement.Type.SALE, quantity_delta=-1)
        return items

    with mock.patch.object(services, "resolve_items", side_effect=resolve_then_lose_the_race):
        fields = _fields(_checkout(_client(cashier), [(last, 1)], 1258_95))
    assert fields == {"lines.0.quantity": ["Only 0 in stock; stock cannot go negative."]}
    assert not Sale.objects.exists()


@pytest.mark.skipif(connection.vendor != "postgresql", reason="Needs Postgres row locks and real concurrent connections")
@pytest.mark.django_db(transaction=True)
def test_concurrent_checkouts_for_the_last_unit():
    rule = TaxRule.objects.create(name="Flat", kind="flat", flat_rate_bp=500)
    category = Category.objects.create(name="Shirts", slug="shirts", hsn_code="6205", tax_rule=rule)
    last = _variant(_product(category, price=1000_00), stock=1)
    users = [_user(Role.CASHIER, email=f"c{i}@example.com") for i in range(4)]
    barrier = threading.Barrier(len(users))
    statuses = []

    def attempt(user):
        barrier.wait()
        statuses.append(_checkout(_client(user), [(last, 1)], 1050_00).status_code)
        connection.close()

    threads = [threading.Thread(target=attempt, args=(user,)) for user in users]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert sorted(statuses) == [201, 400, 400, 400]
    assert _on_hand(last) == 0 and Sale.objects.count() == 1


# --- Discounts ---


def test_cashier_discount_within_limit_needs_no_approval(shirt, cashier):
    body = {"kind": "percent", "value": 1000}
    quote = _client(cashier).post(QUOTE_URL, {"lines": [{"variant": shirt.pk, "quantity": 1}], "discount": body}, format="json").json()
    assert quote["needs_approval"] is False
    response = _checkout(_client(cashier), [(shirt, 1)], quote["total_paise"], discount=body)
    assert response.status_code == 201
    assert response.json()["discount_paise"] == 119_90
    assert response.json()["discount_approved_by_name"] is None


def test_cashier_discount_above_limit_needs_a_pin(shirt, cashier, senior):
    discount = {"kind": "amount", "value": 200_00}
    client = _client(cashier)
    quote = client.post(QUOTE_URL, {"lines": [{"variant": shirt.pk, "quantity": 1}], "discount": discount}, format="json").json()
    assert quote["needs_approval"] is True
    total = quote["total_paise"]

    assert _fields(_checkout(client, [(shirt, 1)], total, discount=discount)) == {
        "approval_pin": ["This discount is above your limit. A Senior cashier or Admin must approve it."]
    }
    assert _fields(_checkout(client, [(shirt, 1)], total, discount=discount, approver_id=cashier.pk, approval_pin="4826")) == {
        "approver_id": ["Choose a Senior cashier or Admin to approve the discount."]
    }
    assert _fields(_checkout(client, [(shirt, 1)], total, discount=discount, approver_id=senior.pk, approval_pin="1111")) == {
        "approval_pin": ["That PIN isn’t right."]
    }
    response = _checkout(client, [(shirt, 1)], total, discount=discount, approver_id=senior.pk, approval_pin="4826")
    assert response.status_code == 201
    sale = Sale.objects.get()
    assert sale.discount_approved_by == senior and sale.discount_paise == 200_00
    assert response.json()["discount_approved_by_name"] == senior.full_name


def test_wrong_pins_lock_the_approver(shirt, cashier, senior):
    discount = {"kind": "amount", "value": 200_00}
    client = _client(cashier)
    total = 1047_90
    for _ in range(5):
        _checkout(client, [(shirt, 1)], total, discount=discount, approver_id=senior.pk, approval_pin="0000")
    fields = _fields(_checkout(client, [(shirt, 1)], total, discount=discount, approver_id=senior.pk, approval_pin="4826"))
    assert "Too many wrong PINs" in fields["approval_pin"][0]
    assert not Sale.objects.exists()


OVER_LIMIT = {"kind": "amount", "value": 200_00}
OVER_LIMIT_TOTAL = 1048_95  # ₹1,199 − ₹200, plus 5% GST


def _approve(client, variant, approver, pin, key=None):
    return _checkout(client, [(variant, 1)], OVER_LIMIT_TOTAL, key=key, discount=OVER_LIMIT, approver_id=approver.pk, approval_pin=pin)


def _pin_attempts(approver) -> int:
    guard = AttemptGuard.objects.filter(key=f"approval-pin:{approver.pk}").first()
    return guard.attempts if guard else 0


def test_lockout_cannot_be_sidestepped(shirt, cashier, senior):
    """Other cashiers, fresh idempotency keys and the quote endpoint all meet the same lock."""
    for _ in range(5):
        _approve(_client(cashier), shirt, senior, "0000")
    other = _user(Role.CASHIER, email="other@example.com")
    for client in (_client(cashier), _client(other)):
        assert "Too many wrong PINs" in _fields(_approve(client, shirt, senior, "4826"))["approval_pin"][0]
    # The quote never checks a PIN, so it can't be used to guess one.
    quote = _client(other).post(
        QUOTE_URL, {"lines": [{"variant": shirt.pk, "quantity": 1}], "discount": OVER_LIMIT}, format="json"
    )
    assert quote.status_code == 200 and quote.json()["needs_approval"] is True
    assert _pin_attempts(senior) == 5
    assert not Sale.objects.exists()
    assert _on_hand(shirt) == 5


def test_lockout_ends_15_minutes_after_the_last_wrong_pin(shirt, cashier, senior):
    for _ in range(5):
        _approve(_client(cashier), shirt, senior, "0000")
    AttemptGuard.objects.update(last_attempt_at=F("last_attempt_at") - timedelta(minutes=14))
    assert "can approve again in 1 minute." in _fields(_approve(_client(cashier), shirt, senior, "4826"))["approval_pin"][0]
    AttemptGuard.objects.update(last_attempt_at=F("last_attempt_at") - timedelta(minutes=1))
    assert _approve(_client(cashier), shirt, senior, "4826").status_code == 201
    assert _pin_attempts(senior) == 0


def test_the_right_pin_clears_earlier_wrong_ones(shirt, cashier, senior):
    for _ in range(4):
        _approve(_client(cashier), shirt, senior, "0000")
    assert _approve(_client(cashier), shirt, senior, "4826").status_code == 201
    for _ in range(5):
        assert _fields(_approve(_client(cashier), shirt, senior, "0000")) == {"approval_pin": ["That PIN isn’t right."]}
    assert Sale.objects.get().discount_approved_by == senior


def test_a_replayed_sale_checks_no_pin(shirt, cashier, senior):
    key = uuid.uuid4()
    assert _approve(_client(cashier), shirt, senior, "4826", key=key).status_code == 201
    # The same bill again returns the saved sale without testing (or counting) the PIN it carries.
    assert _approve(_client(cashier), shirt, senior, "0000", key=key).status_code == 200
    assert _pin_attempts(senior) == 0
    assert Sale.objects.count() == 1


@pytest.mark.django_db(transaction=True)
def test_wrong_pins_stay_counted_when_the_checkout_is_refused(shirt, cashier, senior):
    """Without pytest's wrapping transaction, as in production: each refused checkout writes nothing,
    but its PIN attempt is already committed, so the lock still engages."""
    for _ in range(5):
        _approve(_client(cashier), shirt, senior, "0000")
    assert _pin_attempts(senior) == 5
    assert "Too many wrong PINs" in _fields(_approve(_client(cashier), shirt, senior, "4826"))["approval_pin"][0]
    assert not Sale.objects.exists()
    assert _on_hand(shirt) == 5
    assert StockMovement.objects.filter(variant=shirt).count() == 1  # the opening stock only


@pytest.mark.skipif(connection.vendor != "postgresql", reason="Needs Postgres row locks and real concurrent connections")
@pytest.mark.django_db(transaction=True)
def test_simultaneous_wrong_pins_cannot_exceed_the_limit(shirt, cashier, senior, monkeypatch):
    """Eight wrong PINs at once, on bills for different items (one shared item would queue them on its
    locked stock row). Each check is slowed so they overlap. The old read-then-write count let more than
    five through; with the row-locked count exactly five are checked and three refused."""
    real_check = User.check_approval_pin

    def slow_check(user, pin):
        time.sleep(0.3)
        return real_check(user, pin)

    monkeypatch.setattr(User, "check_approval_pin", slow_check)
    # A real store already has its settings row. Without it, each till would insert it inside its own
    # checkout and the others would wait on that insert, hiding the race this test is about.
    StoreSettings.load()
    products = [_product(shirt.product.category, sku=f"SH-CT-{i:03d}") for i in range(2, 9)]
    variants = [shirt] + [_variant(product) for product in products]
    tills = [(_client(_user(Role.CASHIER, email=f"till{i}@example.com")), v) for i, v in enumerate(variants)]
    barrier = threading.Barrier(len(tills))
    replies = []

    def attempt(client, variant):
        barrier.wait()
        replies.append(_approve(client, variant, senior, "0000").json()["fields"]["approval_pin"][0])
        connection.close()

    threads = [threading.Thread(target=attempt, args=till) for till in tills]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert sorted(r.split(".")[0] for r in replies) == ["That PIN isn’t right"] * 5 + ["Too many wrong PINs"] * 3
    assert _pin_attempts(senior) == 5
    assert "Too many wrong PINs" in _fields(_approve(_client(cashier), shirt, senior, "4826"))["approval_pin"][0]
    assert not Sale.objects.exists()
    assert all(_on_hand(v) == 5 for v in variants)


def test_deactivated_approver_cannot_approve(shirt, cashier, senior):
    senior.is_active = False
    senior.save()
    discount = {"kind": "amount", "value": 200_00}
    fields = _fields(_checkout(_client(cashier), [(shirt, 1)], 1047_90, discount=discount, approver_id=senior.pk, approval_pin="4826"))
    assert "approver_id" in fields


def test_senior_cashier_discounts_on_own_authority(shirt, senior):
    discount = {"kind": "percent", "value": 5000}
    response = _checkout(_client(senior), [(shirt, 1)], 629_48, discount=discount)
    assert response.status_code == 201, response.json()
    assert Sale.objects.get().discount_approved_by == senior


def test_discount_limit_follows_store_setting(shirt, cashier):
    settings = StoreSettings.load()
    settings.cashier_discount_limit_pct = 20
    settings.save()
    quote = _client(cashier).post(
        QUOTE_URL, {"lines": [{"variant": shirt.pk, "quantity": 1}], "discount": {"kind": "percent", "value": 1500}}, format="json"
    ).json()
    assert (quote["discount_limit_paise"], quote["needs_approval"]) == (239_80, False)


# --- Receipt ---


def test_receipt_matches_the_saved_sale_after_catalogue_and_store_changes(shirt, jacket, cashier):
    client = _client(cashier)
    created = _checkout(client, [(shirt, 2), (jacket, 1)], 6057_90).json()

    Product.objects.filter(pk=shirt.product_id).update(name="Renamed Shirt", base_price_paise=1_00)
    TaxRule.objects.update(lower_rate_bp=1200)
    settings = StoreSettings.load()
    settings.name = "New Name"
    settings.save()

    receipt = client.get(f"{SALES_URL}{created['invoice_no']}/").json()
    assert receipt == created
    assert receipt["store"]["name"] == "Loom & Linen"
    assert receipt["lines"][0]["product_name"] == "Classic Cotton Shirt"
    assert receipt["lines"][0]["unit_price_paise"] == 1199_00
    assert (receipt["lines"][0]["hsn_code"], receipt["lines"][0]["variant_sku"]) == ("6205", "SH-CT-001-M-BLU")
    assert sum(line["total_paise"] for line in receipt["lines"]) == receipt["total_paise"]
    assert sum(row["cgst_paise"] + row["sgst_paise"] for row in receipt["tax_breakdown"]) == receipt["tax_paise"]


def test_cashier_sees_only_own_receipts(shirt, cashier, senior):
    invoice = _checkout(_client(cashier), [(shirt, 1)], 1258_95).json()["invoice_no"]
    other = _user(Role.CASHIER, email="other@example.com")
    assert _client(other).get(f"{SALES_URL}{invoice}/").status_code == 404
    assert _client(senior).get(f"{SALES_URL}{invoice}/").status_code == 200
    assert _client(cashier).get(f"{SALES_URL}LD-999999/").status_code == 404


def test_sales_cannot_be_edited_or_deleted(shirt, cashier):
    client = _client(cashier)
    invoice = _checkout(client, [(shirt, 1)], 1258_95).json()["invoice_no"]
    for method in ("put", "patch", "delete"):
        assert getattr(client, method)(f"{SALES_URL}{invoice}/", {}, format="json").status_code == 405
