"""Suppliers, purchases, stock receiving and supplier payments (Phase 7)."""

import datetime as dt
import threading
import uuid
from unittest import mock

import pytest
from django.db import connection
from django.db.models import Sum
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.catalog.models import Category, Product, TaxRule, Variant
from apps.inventory import services as inventory_services
from apps.inventory.models import StockMovement
from apps.inventory.services import record_movement
from apps.suppliers.models import Purchase, Supplier, SupplierPayment

API = "/api/v1/suppliers/"
QUOTE = API + "purchases/quote/"
TODAY = timezone.localdate()


def _user(role, email=None):
    return User.objects.create_user(email=email or f"{role}@example.com", password="x", full_name=f"Test {role}".title(), role=role)


def _client(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


def purchase_url(number, action=""):
    return f"{API}purchases/{number}/{action + '/' if action else ''}"


@pytest.fixture
def admin(db):
    return _user(Role.ADMIN)


@pytest.fixture
def api(admin):
    return _client(admin)


@pytest.fixture
def supplier(db):
    return Supplier.objects.create(name="Malabar Textile House", category="Apparel & fabric", phone="+91 98765 12001")


@pytest.fixture
def stock(db):
    """Two shirt sizes (GST band: 5% to ₹2,500 a unit, 18% above) and a tote (flat 18%)."""
    band = TaxRule.objects.create(name="Garments", kind="band", threshold_paise=2500_00, lower_rate_bp=500, upper_rate_bp=1800)
    flat = TaxRule.objects.create(name="Accessories", kind="flat", flat_rate_bp=1800)
    shirts = Category.objects.create(name="Shirts", slug="shirts", hsn_code="6205", tax_rule=band)
    bags = Category.objects.create(name="Accessories", slug="accessories", hsn_code="4202", tax_rule=flat)
    shirt = Product.objects.create(name="Classic Cotton Shirt", sku="SH-CT-001", category=shirts, base_price_paise=1199_00)
    tote = Product.objects.create(name="Canvas Tote", sku="AC-TT-001", category=bags, base_price_paise=599_00)
    m = Variant.objects.create(product=shirt, size="M", colour="Blue", sku="SH-CT-001-M")
    l = Variant.objects.create(product=shirt, size="L", colour="Blue", sku="SH-CT-001-L")
    t = Variant.objects.create(product=tote, size="One", colour="Sand", sku="AC-TT-001-ONE")
    record_movement(variant=m, type=StockMovement.Type.OPENING, quantity_delta=4)
    return {"m": m, "l": l, "tote": t}


def _body(stock, **overrides):
    body = {
        "supplier_invoice_no": "MTH/2026/118",
        "purchase_date": str(TODAY),
        "notes": "Festive restock",
        "lines": [
            {"variant": stock["m"].pk, "quantity": 10, "unit_cost_paise": 620_00},
            {"variant": stock["l"].pk, "quantity": 3, "unit_cost_paise": 2600_00},
            {"variant": stock["tote"].pk, "quantity": 5, "unit_cost_paise": 210_50, "tax_rate_bp": 1200},
        ],
    }
    body.update(overrides)
    return body


def _record(client, supplier, body, key=None):
    return client.post(f"{API}{supplier.pk}/purchases/", body, format="json", HTTP_IDEMPOTENCY_KEY=str(key or uuid.uuid4()))


def _on_hand(variant):
    variant.refresh_from_db()
    return variant.on_hand


# --- Access ---


def _all_endpoints(supplier_id=1, number="PUR-000001"):
    return [
        ("get", API), ("post", API), ("get", API + "categories/"), ("get", f"{API}{supplier_id}/"),
        ("patch", f"{API}{supplier_id}/"), ("get", f"{API}{supplier_id}/purchases/"), ("post", f"{API}{supplier_id}/purchases/"),
        ("get", f"{API}{supplier_id}/payments/"), ("post", f"{API}{supplier_id}/payments/"),
        ("get", f"{API}{supplier_id}/statement/"), ("post", QUOTE), ("get", API + "purchases/"), ("get", purchase_url(number)),
        ("put", purchase_url(number)), ("post", purchase_url(number, "receive")), ("post", purchase_url(number, "cancel")),
    ]


@pytest.mark.parametrize("method,url", _all_endpoints())
def test_suppliers_need_sign_in(db, method, url):
    response = getattr(APIClient(), method)(url, {}, format="json")
    assert response.status_code == 403 and response.json()["code"] == "not_authenticated"


@pytest.mark.parametrize("role", [Role.CASHIER, Role.SENIOR_CASHIER])
def test_suppliers_are_admin_only(supplier, stock, admin, role):
    purchase = _record(_client(admin), supplier, _body(stock)).json()
    client = _client(_user(role))
    for method, url in _all_endpoints(supplier.pk, purchase["number"]):
        response = getattr(client, method)(url, _body(stock), format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()))
        assert response.status_code == 403, (method, url)
        assert response.json()["code"] == "permission_denied"
    # Nothing a refused request touched changed.
    assert Purchase.objects.count() == 1 and Purchase.objects.get().status == "ordered"
    assert not SupplierPayment.objects.exists() and _on_hand(stock["m"]) == 4


# --- Supplier records ---


def test_create_view_and_edit_a_supplier(api):
    created = api.post(API, {
        "name": "  Cotton Collective ", "category": "Cotton basics", "contact_name": "Asha Varghese",
        "phone": "+91 98765 12002", "email": "hello@cottoncollective.demo", "gstin": "32abcde1234f1z5",
        "address": "Market Road, Kochi", "state": "Kerala", "notes": "Delivers on Mondays",
    }, format="json")
    assert created.status_code == 201, created.json()
    body = created.json()
    assert body["name"] == "Cotton Collective" and body["gstin"] == "32ABCDE1234F1Z5" and body["status"] == "active"
    assert (body["balance_paise"], body["received_paise"], body["paid_paise"], body["awaiting_paise"]) == (0, 0, 0, 0)
    edited = api.patch(f"{API}{body['id']}/", {"contact_name": "Rafi K", "phone": "0484 2345678"}, format="json")
    assert edited.status_code == 200 and edited.json()["contact_name"] == "Rafi K"
    assert api.get(f"{API}{body['id']}/").json()["phone"] == "0484 2345678"


@pytest.mark.parametrize(
    "payload,field",
    [
        ({"name": "malabar textile house", "category": "X"}, "name"),
        ({"name": "New", "category": "  "}, "category"),
        ({"name": "New", "category": "X", "gstin": "12345"}, "gstin"),
        ({"name": "New", "category": "X", "phone": "call me"}, "phone"),
        ({"name": "New", "category": "X", "email": "not-an-email"}, "email"),
        ({"name": "New", "category": "X", "status": "archived"}, "status"),
    ],
)
def test_supplier_validation(api, supplier, payload, field):
    response = api.post(API, payload, format="json")
    assert response.status_code == 400 and field in response.json()["fields"]
    assert Supplier.objects.count() == 1


def test_balance_cannot_be_typed_in(api, supplier):
    api.patch(f"{API}{supplier.pk}/", {"balance_paise": 999_00, "paid_paise": 5}, format="json")
    assert api.get(f"{API}{supplier.pk}/").json()["balance_paise"] == 0


def test_suppliers_are_deactivated_not_deleted(api, supplier, stock):
    number = _record(api, supplier, _body(stock)).json()["number"]
    assert api.delete(f"{API}{supplier.pk}/").status_code == 405
    assert api.patch(f"{API}{supplier.pk}/", {"status": "inactive"}, format="json").json()["status"] == "inactive"
    # History stays readable, and the waiting purchase can still be received.
    assert api.get(f"{API}{supplier.pk}/purchases/").json()["count"] == 1
    assert api.post(purchase_url(number, "receive")).status_code == 200
    # New purchases need an active supplier.
    response = _record(api, supplier, _body(stock, supplier_invoice_no="MTH/2026/119"))
    assert response.status_code == 400 and "supplier" in response.json()["fields"]


def test_list_search_filters_ordering_and_pagination(api, supplier):
    Supplier.objects.create(name="Cotton Collective", category="Cotton basics", contact_name="Asha", gstin="32ABCDE1234F1Z5")
    Supplier.objects.create(name="Urban Stitch", category="Denim", email="sales@urbanstitch.demo", status="inactive")
    names = lambda r: [s["name"] for s in r.json()["results"]]  # noqa: E731
    assert names(api.get(API)) == ["Cotton Collective", "Malabar Textile House", "Urban Stitch"]
    assert names(api.get(API, {"q": "asha"})) == ["Cotton Collective"]
    assert names(api.get(API, {"q": "urbanstitch"})) == ["Urban Stitch"]
    assert names(api.get(API, {"q": "32abcde1234f1z5"})) == ["Cotton Collective"]
    assert names(api.get(API, {"status": "inactive"})) == ["Urban Stitch"]
    assert names(api.get(API, {"category": "denim"})) == ["Urban Stitch"]
    assert api.get(API + "categories/").json() == ["Apparel & fabric", "Cotton basics", "Denim"]
    page = api.get(API, {"page_size": 2, "page": 2}).json()
    assert page["count"] == 3 and [s["name"] for s in page["results"]] == ["Urban Stitch"]
    SupplierPayment.objects.create(
        supplier=supplier, paid_on=TODAY, amount_paise=100_00, method="upi", recorded_by=_user(Role.ADMIN, "b@example.com"),
        idempotency_key=uuid.uuid4(), request_hash="x",
    )
    assert names(api.get(API, {"ordering": "balance"}))[0] == "Malabar Textile House"
    assert api.get(f"{API}99999/").status_code == 404


# --- Recording purchases (no stock change) ---


def test_recording_a_purchase_computes_totals_and_changes_no_stock(api, supplier, stock, admin):
    response = _record(api, supplier, _body(stock))
    assert response.status_code == 201, response.json()
    body = response.json()
    assert body["number"].startswith("PUR-") and body["status"] == "ordered" and body["created_by_name"] == "Test Admin"
    lines = {line["variant_sku"]: line for line in body["lines"]}
    # Shirt M: ₹620 a unit is in the 5% band. Shirt L: ₹2,600 a unit is above ₹2,500, so 18%.
    assert (lines["SH-CT-001-M"]["tax_rate_bp"], lines["SH-CT-001-M"]["subtotal_paise"], lines["SH-CT-001-M"]["tax_paise"]) == (500, 6200_00, 310_00)
    assert (lines["SH-CT-001-L"]["tax_rate_bp"], lines["SH-CT-001-L"]["tax_paise"]) == (1800, 1404_00)
    # Tote at the invoice's 12%: 5 × ₹210.50 = ₹1,052.50; 12% = ₹126.30.
    assert (lines["AC-TT-001-ONE"]["tax_rate_bp"], lines["AC-TT-001-ONE"]["tax_paise"], lines["AC-TT-001-ONE"]["total_paise"]) == (1200, 126_30, 1178_80)
    assert body["subtotal_paise"] == 6200_00 + 7800_00 + 1052_50
    assert body["tax_paise"] == 310_00 + 1404_00 + 126_30
    assert body["total_paise"] == body["subtotal_paise"] + body["tax_paise"]
    # Recording is not receiving.
    assert (_on_hand(stock["m"]), _on_hand(stock["l"]), _on_hand(stock["tote"])) == (4, 0, 0)
    assert not StockMovement.objects.filter(type=StockMovement.Type.PURCHASE).exists()
    detail = api.get(f"{API}{supplier.pk}/").json()
    assert (detail["awaiting_paise"], detail["received_paise"], detail["balance_paise"]) == (body["total_paise"], 0, 0)


def test_gst_rounds_half_up_per_line(api, supplier, stock):
    # 3 × ₹0.15 = ₹0.45 at 5% = 2.25 paise → 2; 1 × ₹0.50 at 5% = 2.5 paise → 3.
    body = _body(stock, lines=[
        {"variant": stock["m"].pk, "quantity": 3, "unit_cost_paise": 15},
        {"variant": stock["l"].pk, "quantity": 1, "unit_cost_paise": 50},
    ])
    lines = _record(api, supplier, body).json()["lines"]
    assert [line["tax_paise"] for line in lines] == [2, 3]


def test_quote_matches_what_is_recorded(api, supplier, stock):
    quote = api.post(QUOTE, {"lines": _body(stock)["lines"]}, format="json").json()
    recorded = _record(api, supplier, _body(stock)).json()
    assert {k: quote[k] for k in ("subtotal_paise", "tax_paise", "total_paise")} == {
        k: recorded[k] for k in ("subtotal_paise", "tax_paise", "total_paise")
    }
    assert [line["tax_rate_bp"] for line in quote["lines"]] == [500, 1800, 1200]
    assert Purchase.objects.count() == 1  # the quote saved nothing


@pytest.mark.parametrize(
    "change,field",
    [
        ({"lines": []}, "lines"),
        ({"purchase_date": str(TODAY + dt.timedelta(days=1))}, "purchase_date"),
        ({"purchase_date": "20-10-2026"}, "purchase_date"),
        ({"lines": [{"variant": 999999, "quantity": 1, "unit_cost_paise": 100}]}, "lines.0.variant"),
        ({"lines": [{"variant": "VAR", "quantity": 0, "unit_cost_paise": 100}]}, "lines.0.quantity"),
        ({"lines": [{"variant": "VAR", "quantity": 1, "unit_cost_paise": 0}]}, "lines.0.unit_cost_paise"),
        ({"lines": [{"variant": "VAR", "quantity": 1.5, "unit_cost_paise": 100}]}, "lines.0.quantity"),
        ({"lines": [{"variant": "VAR", "quantity": 1, "unit_cost_paise": 100, "tax_rate_bp": 700}]}, "lines.0.tax_rate_bp"),
        ({"lines": [{"variant": "VAR", "quantity": 1, "unit_cost_paise": 100}, {"variant": "VAR", "quantity": 2, "unit_cost_paise": 100}]}, "lines.1.variant"),
        ({"supplier_invoice_no": "x" * 41}, "supplier_invoice_no"),
    ],
)
def test_invalid_purchases_record_nothing(api, supplier, stock, change, field):
    if "lines" in change:
        for line in change["lines"]:
            if line["variant"] == "VAR":
                line["variant"] = stock["m"].pk
    response = _record(api, supplier, _body(stock, **change))
    assert response.status_code == 400 and field in response.json()["fields"], response.json()
    assert not Purchase.objects.exists()


def test_inactive_items_cannot_be_bought_in(api, supplier, stock):
    Variant.objects.filter(pk=stock["l"].pk).update(is_active=False)
    response = _record(api, supplier, _body(stock))
    assert response.status_code == 400 and "lines.1.variant" in response.json()["fields"]
    Variant.objects.filter(pk=stock["l"].pk).update(is_active=True)
    Product.objects.filter(pk=stock["tote"].product_id).update(status="inactive")
    assert "lines.2.variant" in _record(api, supplier, _body(stock)).json()["fields"]


def test_record_needs_an_idempotency_key(api, supplier, stock):
    response = api.post(f"{API}{supplier.pk}/purchases/", _body(stock), format="json")
    assert response.status_code == 400 and "idempotency_key" in response.json()["fields"]


def test_a_retried_record_returns_the_first_purchase(api, supplier, stock):
    key = uuid.uuid4()
    first = _record(api, supplier, _body(stock), key)
    again = _record(api, supplier, _body(stock), key)
    assert (first.status_code, again.status_code) == (201, 200)
    assert first.json()["number"] == again.json()["number"] and Purchase.objects.count() == 1
    changed = _record(api, supplier, _body(stock, notes="Different"), key)
    assert changed.status_code == 409 and changed.json()["code"] == "idempotency_key_reused"
    assert first.json()["number"] in changed.json()["detail"]


def test_a_supplier_invoice_is_recorded_once(api, supplier, stock):
    number = _record(api, supplier, _body(stock)).json()["number"]
    duplicate = _record(api, supplier, _body(stock, supplier_invoice_no="mth/2026/118"))
    assert duplicate.status_code == 400 and "supplier_invoice_no" in duplicate.json()["fields"]
    other = Supplier.objects.create(name="Cotton Collective", category="Cotton basics")
    assert _record(api, other, _body(stock)).status_code == 201  # another supplier's numbering
    api.post(purchase_url(number, "cancel"), {"reason": "Entered twice"}, format="json")
    assert _record(api, supplier, _body(stock)).status_code == 201  # cancelled entries free the number
    blank = [_record(api, supplier, _body(stock, supplier_invoice_no="")).status_code for _ in range(2)]
    assert blank == [201, 201]


def test_editing_replaces_lines_and_totals_while_awaiting_goods(api, supplier, stock):
    number = _record(api, supplier, _body(stock)).json()["number"]
    lines = [{"variant": stock["m"].pk, "quantity": 8, "unit_cost_paise": 620_00}]
    edited = api.put(purchase_url(number), _body(stock, lines=lines, supplier_invoice_no="MTH/2026/118-A"), format="json")
    assert edited.status_code == 200, edited.json()
    body = edited.json()
    assert [(l["variant_sku"], l["quantity"]) for l in body["lines"]] == [("SH-CT-001-M", 8)]
    assert (body["subtotal_paise"], body["tax_paise"], body["supplier_invoice_no"]) == (4960_00, 248_00, "MTH/2026/118-A")
    assert _on_hand(stock["m"]) == 4


def test_lines_keep_the_names_they_were_bought_under(api, supplier, stock):
    number = _record(api, supplier, _body(stock)).json()["number"]
    Product.objects.filter(pk=stock["m"].product_id).update(name="Renamed Shirt")
    Variant.objects.filter(pk=stock["m"].pk).update(sku="SH-NEW-M")
    line = api.get(purchase_url(number)).json()["lines"][0]
    assert (line["product_name"], line["variant_sku"]) == ("Classic Cotton Shirt", "SH-CT-001-M")


# --- Receiving ---


def test_receiving_adds_stock_once_with_purchase_movements(api, supplier, stock, admin):
    number = _record(api, supplier, _body(stock)).json()["number"]
    received = api.post(purchase_url(number, "receive"))
    assert received.status_code == 200, received.json()
    body = received.json()
    assert body["status"] == "received" and body["received_by_name"] == "Test Admin" and body["received_at"]
    assert (_on_hand(stock["m"]), _on_hand(stock["l"]), _on_hand(stock["tote"])) == (14, 3, 5)
    movements = StockMovement.objects.filter(reference=number).order_by("variant_id")
    assert [(m.variant_id, m.type, m.quantity_delta, m.actor_id) for m in movements] == [
        (stock["m"].pk, "purchase", 10, admin.pk), (stock["l"].pk, "purchase", 3, admin.pk), (stock["tote"].pk, "purchase", 5, admin.pk),
    ]
    assert movements[0].reason == "Received from Malabar Textile House, invoice MTH/2026/118"
    assert movements[0].balance_after == 14

    # A second submission (double click, retry, another tab) adds nothing.
    again = api.post(purchase_url(number, "receive"))
    assert again.status_code == 409 and again.json()["code"] == "already_received"
    assert (_on_hand(stock["m"]), _on_hand(stock["l"]), _on_hand(stock["tote"])) == (14, 3, 5)
    assert StockMovement.objects.filter(reference=number).count() == 3

    # Received purchases are closed.
    assert api.put(purchase_url(number), _body(stock), format="json").json()["code"] == "purchase_closed"
    assert api.post(purchase_url(number, "cancel"), {"reason": "Oops"}, format="json").status_code == 409


def test_receiving_needs_the_supplier_invoice_number(api, supplier, stock):
    number = _record(api, supplier, _body(stock, supplier_invoice_no="")).json()["number"]
    response = api.post(purchase_url(number, "receive"))
    assert response.status_code == 400 and "supplier_invoice_no" in response.json()["fields"]
    assert _on_hand(stock["m"]) == 4 and Purchase.objects.get().status == "ordered"


def test_a_failed_receipt_leaves_no_partial_changes(api, supplier, stock, admin):
    number = _record(api, supplier, _body(stock)).json()["number"]
    real = inventory_services.record_movement
    calls = []

    def fail_on_second(**kwargs):
        calls.append(kwargs["variant"].sku)
        if len(calls) == 2:
            raise RuntimeError("database went away")
        return real(**kwargs)

    from apps.suppliers import services

    with mock.patch.object(services, "record_movement", side_effect=fail_on_second):
        with pytest.raises(RuntimeError):
            services.receive_purchase(Purchase.objects.get(number=number), admin)
    assert len(calls) == 2
    assert (_on_hand(stock["m"]), _on_hand(stock["l"]), _on_hand(stock["tote"])) == (4, 0, 0)
    assert not StockMovement.objects.filter(reference=number).exists()
    assert Purchase.objects.get(number=number).status == "ordered"
    # Nothing is stuck: the same purchase receives normally afterwards.
    assert api.post(purchase_url(number, "receive")).status_code == 200
    assert _on_hand(stock["m"]) == 14


def test_cancelling_needs_a_reason_and_blocks_receipt(api, supplier, stock):
    number = _record(api, supplier, _body(stock)).json()["number"]
    assert "reason" in api.post(purchase_url(number, "cancel"), {"reason": " "}, format="json").json()["fields"]
    cancelled = api.post(purchase_url(number, "cancel"), {"reason": "Supplier out of stock"}, format="json").json()
    assert (cancelled["status"], cancelled["cancel_reason"], cancelled["cancelled_by_name"]) == ("cancelled", "Supplier out of stock", "Test Admin")
    response = api.post(purchase_url(number, "receive"))
    assert response.status_code == 409 and response.json()["code"] == "purchase_closed"
    assert _on_hand(stock["m"]) == 4
    assert api.get(f"{API}{supplier.pk}/").json()["awaiting_paise"] == 0


def test_unknown_purchase(api):
    assert api.get(purchase_url("PUR-999999")).status_code == 404
    assert api.post(purchase_url("PUR-999999", "receive")).status_code == 404


def test_receipts_reconcile_with_the_stock_ledger(api, supplier, stock):
    first = _record(api, supplier, _body(stock)).json()["number"]
    second = _record(api, supplier, _body(stock, supplier_invoice_no="MTH/2026/120", lines=[
        {"variant": stock["m"].pk, "quantity": 2, "unit_cost_paise": 600_00},
    ])).json()["number"]
    api.post(purchase_url(first, "receive"))
    api.post(purchase_url(second, "receive"))
    for variant in stock.values():
        ledger = variant.movements.aggregate(total=Sum("quantity_delta"))["total"] or 0
        latest = variant.movements.order_by("-created_at", "-id").first()
        assert ledger == _on_hand(variant) == latest.balance_after
    received_units = sum(line.quantity for p in Purchase.objects.filter(status="received") for line in p.lines.all())
    purchase_units = StockMovement.objects.filter(type="purchase").aggregate(total=Sum("quantity_delta"))["total"]
    assert received_units == purchase_units == 20
    # The inventory ledger shows each receipt under its purchase number.
    rows = api.get("/api/v1/inventory/movements/", {"q": second}).json()["results"]
    assert [(r["type"], r["quantity_delta"], r["reference"]) for r in rows] == [("purchase", 2, second)]


@pytest.mark.skipif(connection.vendor != "postgresql", reason="Needs Postgres row locks and real concurrent connections")
@pytest.mark.django_db(transaction=True)
def test_concurrent_receipts_add_stock_once():
    supplier = Supplier.objects.create(name="Malabar", category="Apparel")
    rule = TaxRule.objects.create(name="Flat", kind="flat", flat_rate_bp=500)
    category = Category.objects.create(name="Shirts", slug="shirts", hsn_code="6205", tax_rule=rule)
    product = Product.objects.create(name="Shirt", sku="SH-1", category=category, base_price_paise=1000_00)
    variant = Variant.objects.create(product=product, size="M", colour="Blue", sku="SH-1-M")
    admins = [_user(Role.ADMIN, email=f"a{i}@example.com") for i in range(4)]
    body = {"supplier_invoice_no": "INV-1", "purchase_date": str(TODAY), "lines": [{"variant": variant.pk, "quantity": 6, "unit_cost_paise": 500_00}]}
    number = _record(_client(admins[0]), supplier, body).json()["number"]
    barrier = threading.Barrier(len(admins))
    statuses = []

    def attempt(user):
        barrier.wait()
        statuses.append(_client(user).post(purchase_url(number, "receive")).status_code)
        connection.close()

    threads = [threading.Thread(target=attempt, args=(user,)) for user in admins]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert sorted(statuses) == [200, 409, 409, 409]
    assert _on_hand(variant) == 6 and variant.movements.filter(type="purchase").count() == 1


# --- Payments, balance and statement ---


def _pay(client, supplier, key=None, **fields):
    body = {"paid_on": str(TODAY), "amount_paise": 5000_00, "method": "bank_transfer", "reference": "UTR123", **fields}
    return client.post(f"{API}{supplier.pk}/payments/", body, format="json", HTTP_IDEMPOTENCY_KEY=str(key or uuid.uuid4()))


def test_payments_are_recorded_entries_not_verified_settlements(api, supplier):
    response = _pay(api, supplier)
    assert response.status_code == 201, response.json()
    body = response.json()
    assert (body["amount_paise"], body["method"], body["gateway_verified"], body["recorded_by_name"]) == (5000_00, "bank_transfer", False, "Test Admin")
    assert api.get(f"{API}{supplier.pk}/payments/").json()["count"] == 1


@pytest.mark.parametrize(
    "fields,field",
    [({"amount_paise": 0}, "amount_paise"), ({"amount_paise": -5}, "amount_paise"), ({"method": "crypto"}, "method"),
     ({"paid_on": str(TODAY + dt.timedelta(days=2))}, "paid_on"), ({"reference": "x" * 61}, "reference")],
)
def test_invalid_payments_record_nothing(api, supplier, fields, field):
    response = _pay(api, supplier, **fields)
    assert response.status_code == 400 and field in response.json()["fields"]
    assert not SupplierPayment.objects.exists()


def test_a_retried_payment_is_recorded_once(api, supplier):
    key = uuid.uuid4()
    assert [_pay(api, supplier, key).status_code for _ in range(2)] == [201, 200]
    assert SupplierPayment.objects.count() == 1
    assert _pay(api, supplier, key, amount_paise=1).json()["code"] == "idempotency_key_reused"


def test_balance_and_statement_count_received_goods_and_recorded_payments(api, supplier, stock):
    old = TODAY - dt.timedelta(days=10)
    first = _record(api, supplier, _body(stock, purchase_date=str(old), lines=[
        {"variant": stock["m"].pk, "quantity": 10, "unit_cost_paise": 100_00, "tax_rate_bp": 500},
    ])).json()
    _record(api, supplier, _body(stock, supplier_invoice_no="AWAITING", lines=[
        {"variant": stock["m"].pk, "quantity": 1, "unit_cost_paise": 9999_00},
    ]))
    api.post(purchase_url(first["number"], "receive"))
    _pay(api, supplier, paid_on=str(old + dt.timedelta(days=1)), amount_paise=400_00, method="upi", reference="UPI-9")
    _pay(api, supplier, paid_on=str(TODAY), amount_paise=700_00, method="cheque", reference="CHQ 0042")

    detail = api.get(f"{API}{supplier.pk}/").json()
    # Owed only for goods received: ₹1,050 (₹1,000 + 5%). Paid ₹1,100, so ₹50 has been paid in advance.
    assert (detail["received_paise"], detail["paid_paise"], detail["balance_paise"]) == (1050_00, 1100_00, -50_00)
    assert detail["awaiting_paise"] > 0
    assert api.get(API).json()["results"][0]["balance_paise"] == -50_00

    statement = api.get(f"{API}{supplier.pk}/statement/").json()
    assert [(e["kind"], e["reference"], e["debit_paise"], e["credit_paise"], e["balance_paise"]) for e in statement["entries"]] == [
        ("purchase", first["number"], 1050_00, 0, 1050_00),
        ("payment", "UPI-9", 0, 400_00, 650_00),
        ("payment", "CHQ 0042", 0, 700_00, -50_00),
    ]
    assert statement["entries"][1]["detail"] == "UPI payment, recorded by staff"
    assert statement["balance_paise"] == -50_00
    assert api.get(f"{API}{supplier.pk}/statement/").json() == statement  # reading writes nothing


def test_supplier_purchase_list(api, supplier, stock):
    first = _record(api, supplier, _body(stock)).json()["number"]
    _record(api, supplier, _body(stock, supplier_invoice_no="B"))
    api.post(purchase_url(first, "receive"))
    rows = api.get(f"{API}{supplier.pk}/purchases/").json()["results"]
    assert [r["status"] for r in rows] == ["ordered", "received"]
    assert rows[1]["item_count"] == 18 and rows[1]["supplier_name"] == "Malabar Textile House"
    assert [r["number"] for r in api.get(f"{API}{supplier.pk}/purchases/", {"status": "received"}).json()["results"]] == [first]
    assert api.get(f"{API}99999/purchases/").status_code == 404


def test_purchases_across_suppliers(api, supplier, stock):
    other = Supplier.objects.create(name="Cotton Collective", category="Cotton basics")
    received = _record(api, supplier, _body(stock)).json()["number"]
    api.post(purchase_url(received, "receive"))
    awaiting = _record(api, other, _body(stock, supplier_invoice_no="CC/77")).json()["number"]
    cancelled = _record(api, supplier, _body(stock, supplier_invoice_no="X-1")).json()["number"]
    api.post(purchase_url(cancelled, "cancel"), {"reason": "Entered twice"}, format="json")

    def numbers(**params):
        response = api.get(API + "purchases/", params)
        assert response.status_code == 200, response.json()
        return [r["number"] for r in response.json()["results"]]

    assert numbers() == [cancelled, awaiting, received]
    assert numbers(status="ordered") == [awaiting]
    # Search: purchase number, supplier invoice number or supplier name, case-insensitive.
    assert numbers(q="cc/77") == [awaiting]
    assert numbers(q="cotton coll") == [awaiting]
    assert numbers(q=received) == [received]
    assert numbers(q="nothing like this") == []
    assert api.get(API + "purchases/", {"status": "lost"}).status_code == 400
    row = api.get(API + "purchases/", {"status": "ordered"}).json()["results"][0]
    assert row["supplier_name"] == "Cotton Collective" and row["item_count"] == 18 and row["total_paise"] > 0


def test_purchase_lines_show_current_stock_for_the_receive_preview(api, supplier, stock):
    number = _record(api, supplier, _body(stock)).json()["number"]
    lines = {line["variant_sku"]: line for line in api.get(purchase_url(number)).json()["lines"]}
    assert (lines["SH-CT-001-M"]["current_on_hand"], lines["SH-CT-001-M"]["quantity"]) == (4, 10)
    assert lines["AC-TT-001-ONE"]["current_on_hand"] == 0
    api.post(purchase_url(number, "receive"))
    lines = {line["variant_sku"]: line for line in api.get(purchase_url(number)).json()["lines"]}
    # Live, not a snapshot: after receiving it includes the received units.
    assert lines["SH-CT-001-M"]["current_on_hand"] == 14 and lines["AC-TT-001-ONE"]["current_on_hand"] == 5
