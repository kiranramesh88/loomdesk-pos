"""Sales history: list, filters, detail, reprint and the admin summary (Phase 5)."""

import datetime as dt
from zoneinfo import ZoneInfo

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Role
from apps.catalog.models import Product, TaxRule, Variant
from apps.inventory.models import StockMovement
from apps.sales.models import Sale
from apps.store.models import StoreSettings

# Fixtures and helpers shared with the checkout tests.
from apps.sales.test_api import (  # noqa: F401
    SALES_URL,
    _checkout,
    _client,
    _on_hand,
    _user,
    cashier,
    garments,
    jacket,
    senior,
    shirt,
    shirts,
)

SUMMARY_URL = SALES_URL + "summary/"
CASHIERS_URL = SALES_URL + "cashiers/"
STORE_TZ = ZoneInfo("Asia/Kolkata")
SHIRT_TOTAL = 1258_95  # ₹1,199 + 5% GST
JACKET_TOTAL = 3540_00  # ₹3,000 + 18% GST


@pytest.fixture
def admin(db):
    return _user(Role.ADMIN)


def _sell(user, lines, total, **payment):
    response = _checkout(_client(user), lines, total, payment=payment or None)
    assert response.status_code == 201, response.json()
    return response.json()["invoice_no"]


def _at(invoice_no, year, month, day, hour=12, minute=0):
    """Backdate a sale (created_at is auto_now_add), in store time."""
    when = dt.datetime(year, month, day, hour, minute, tzinfo=STORE_TZ)
    Sale.objects.filter(invoice_no=invoice_no).update(created_at=when)


def _invoices(response):
    assert response.status_code == 200, response.json()
    return [row["invoice_no"] for row in response.json()["results"]]


# --- Access ---


@pytest.mark.parametrize("url", [SALES_URL, SUMMARY_URL, CASHIERS_URL])
def test_history_needs_sign_in(db, url):
    response = APIClient().get(url)
    assert response.status_code == 403
    assert response.json()["code"] == "not_authenticated"


@pytest.mark.parametrize("role", [Role.CASHIER, Role.SENIOR_CASHIER])
@pytest.mark.parametrize("url", [SUMMARY_URL, CASHIERS_URL])
def test_summary_and_cashier_list_are_admin_only(db, role, url):
    response = _client(_user(role)).get(url)
    assert response.status_code == 403
    assert response.json()["code"] == "permission_denied"


def test_cashier_lists_only_their_own_sales(shirt, cashier, senior, admin):
    own = _sell(cashier, [(shirt, 1)], SHIRT_TOTAL)
    other = _user(Role.CASHIER, email="other@example.com")
    theirs = _sell(other, [(shirt, 1)], SHIRT_TOTAL)

    assert _invoices(_client(cashier).get(SALES_URL)) == [own]
    # Asking for someone else's sales by filter still returns only your own: the scope comes first.
    assert _invoices(_client(cashier).get(SALES_URL, {"cashier": other.pk})) == []
    assert _client(cashier).get(f"{SALES_URL}{theirs}/").status_code == 404
    assert set(_invoices(_client(senior).get(SALES_URL))) == {own, theirs}
    assert set(_invoices(_client(admin).get(SALES_URL))) == {own, theirs}
    assert _client(admin).get(f"{SALES_URL}{theirs}/").status_code == 200


def test_deactivated_cashier_cannot_read_history(shirt, cashier):
    invoice = _sell(cashier, [(shirt, 1)], SHIRT_TOTAL)
    client = APIClient()
    client.force_login(cashier)
    cashier.is_active = False
    cashier.save()
    assert client.get(SALES_URL).status_code == 403
    assert client.get(f"{SALES_URL}{invoice}/").status_code == 403


@pytest.mark.parametrize("invoice_no", ["LD-999999", "ld-000001x", "not-an-invoice", "%20", "x" * 300])
def test_unknown_or_malformed_invoice_is_not_found(shirt, admin, invoice_no):
    _sell(admin, [(shirt, 1)], SHIRT_TOTAL)
    response = _client(admin).get(f"{SALES_URL}{invoice_no}/")
    assert response.status_code == 404


# --- List, search, filters and pagination ---


def test_list_row_has_the_saved_figures(shirt, jacket, admin, cashier):
    invoice = _sell(cashier, [(shirt, 2), (jacket, 1)], 6057_90, method="upi", reference="UTR123")
    row = _client(admin).get(SALES_URL).json()["results"][0]
    assert row == {
        "invoice_no": invoice,
        "status": "completed",
        "created_at": row["created_at"],
        "cashier": cashier.pk,
        "cashier_name": "Test Cashier",
        "item_count": 3,
        "discount_paise": 0,
        "total_paise": 6057_90,
        "payment_method": "upi",
        "gateway_verified": False,
        "return_state": "none",
    }


def test_list_is_newest_first_and_paginated(shirt, admin):
    shirt.on_hand  # five units in stock: enough for five one-unit sales
    invoices = [_sell(admin, [(shirt, 1)], SHIRT_TOTAL) for _ in range(5)]
    client = _client(admin)

    first = client.get(SALES_URL, {"page_size": 2}).json()
    assert first["count"] == 5
    assert [r["invoice_no"] for r in first["results"]] == invoices[::-1][:2]
    third = client.get(SALES_URL, {"page_size": 2, "page": 3}).json()
    assert [r["invoice_no"] for r in third["results"]] == invoices[:1]
    assert client.get(SALES_URL, {"page_size": 2, "page": 4}).status_code == 404


def test_search_by_invoice_number(shirt, admin):
    first, second = (_sell(admin, [(shirt, 1)], SHIRT_TOTAL) for _ in range(2))
    client = _client(admin)
    assert _invoices(client.get(SALES_URL, {"q": second})) == [second]
    assert _invoices(client.get(SALES_URL, {"q": " ld-000001 "})) == [first]
    assert set(_invoices(client.get(SALES_URL, {"q": "LD-0000"}))) == {first, second}
    assert _invoices(client.get(SALES_URL, {"q": "nothing"})) == []


def test_filter_by_cashier_method_and_status(shirt, jacket, admin, cashier):
    cash = _sell(cashier, [(shirt, 1)], SHIRT_TOTAL)
    card = _sell(admin, [(jacket, 1)], JACKET_TOTAL, method="card", reference="4242")
    client = _client(admin)
    assert _invoices(client.get(SALES_URL, {"cashier": cashier.pk})) == [cash]
    assert _invoices(client.get(SALES_URL, {"method": "card"})) == [card]
    assert _invoices(client.get(SALES_URL, {"method": "upi"})) == []
    assert set(_invoices(client.get(SALES_URL, {"status": "completed"}))) == {cash, card}

    response = client.get(SALES_URL, {"method": "cheque"})
    assert response.status_code == 400
    assert "method" in response.json()["fields"]


def test_date_range_uses_store_dates(shirt, admin):
    late_night = _sell(admin, [(shirt, 1)], SHIRT_TOTAL)
    next_day = _sell(admin, [(shirt, 1)], SHIRT_TOTAL)
    # 11:30 pm in Kozhikode is still 18 Oct there, though it's 6 pm UTC.
    _at(late_night, 2026, 10, 18, 23, 30)
    _at(next_day, 2026, 10, 19, 0, 30)
    client = _client(admin)

    assert _invoices(client.get(SALES_URL, {"date_from": "2026-10-18", "date_to": "2026-10-18"})) == [late_night]
    assert _invoices(client.get(SALES_URL, {"date_from": "2026-10-19"})) == [next_day]
    assert _invoices(client.get(SALES_URL, {"date_to": "2026-10-17"})) == []


def test_bad_date_range_is_rejected(admin):
    client = _client(admin)
    response = client.get(SALES_URL, {"date_from": "2026-10-20", "date_to": "2026-10-01"})
    assert response.status_code == 400
    assert response.json()["fields"] == {"date_to": ["The end date is before the start date."]}
    assert "date_from" in client.get(SALES_URL, {"date_from": "20/10/2026"}).json()["fields"]


# --- Detail and reprint ---


def test_detail_keeps_history_after_product_tax_and_store_changes(shirt, jacket, admin, cashier, senior):
    discount = {"kind": "amount", "value": 200_00}
    quote = _client(cashier).post(
        SALES_URL + "quote/", {"lines": [{"variant": shirt.pk, "quantity": 1}], "discount": discount}, format="json"
    ).json()
    created = _checkout(
        _client(cashier), [(shirt, 1)], quote["total_paise"], discount=discount, approver_id=senior.pk, approval_pin="4826"
    ).json()

    Product.objects.filter(pk=shirt.product_id).update(name="Renamed", hsn_code="9999", base_price_paise=1_00)
    Variant.objects.filter(pk=shirt.pk).update(sku="NEW-SKU", size="XXL", price_override_paise=5_00)
    TaxRule.objects.update(lower_rate_bp=1200, upper_rate_bp=2800)
    store = StoreSettings.load()
    store.name, store.gstin = "Another Store", "32ABCDE1234F1Z9"
    store.save()
    senior.full_name = "Renamed Senior"
    senior.save()

    detail = _client(admin).get(f"{SALES_URL}{created['invoice_no']}/").json()
    assert detail == created
    line = detail["lines"][0]
    assert (line["product_name"], line["variant_sku"], line["size"], line["hsn_code"]) == (
        "Classic Cotton Shirt", "SH-CT-001-M-BLU", "M", "6205",
    )
    assert (line["unit_price_paise"], line["discount_paise"], line["tax_rate_bp"]) == (1199_00, 200_00, 500)
    assert detail["store"]["name"] == "Loom & Linen"
    assert detail["discount_approved_by_name"] == "Test Senior_Cashier"


def test_reprinting_changes_nothing(shirt, jacket, admin, cashier):
    invoice = _sell(cashier, [(shirt, 2), (jacket, 1)], 6057_90)
    stock = (_on_hand(shirt), _on_hand(jacket))
    sale = Sale.objects.get()
    before = (Sale.objects.count(), StockMovement.objects.count(), sale.total_paise, sale.created_at)
    client = _client(admin)

    first = client.get(f"{SALES_URL}{invoice}/").json()
    for _ in range(3):
        assert client.get(f"{SALES_URL}{invoice}/").json() == first
    _client(cashier).get(f"{SALES_URL}{invoice}/")

    sale.refresh_from_db()
    assert (Sale.objects.count(), StockMovement.objects.count(), sale.total_paise, sale.created_at) == before
    assert (_on_hand(shirt), _on_hand(jacket)) == stock
    assert first["invoice_no"] == invoice == "LD-000001"
    # The next sale still gets the next number: reading a receipt never takes one.
    assert _sell(cashier, [(shirt, 1)], SHIRT_TOTAL) == "LD-000002"


def test_history_is_read_only(shirt, admin):
    invoice = _sell(admin, [(shirt, 1)], SHIRT_TOTAL)
    client = _client(admin)
    for method in ("put", "patch", "delete"):
        assert getattr(client, method)(f"{SALES_URL}{invoice}/", {}, format="json").status_code == 405
        assert getattr(client, method)(SALES_URL, {}, format="json").status_code == 405
    for url in (SUMMARY_URL, CASHIERS_URL):
        assert client.post(url, {}, format="json").status_code == 405


# --- Summary ---


def test_summary_with_no_sales_is_zero(admin):
    body = _client(admin).get(SUMMARY_URL).json()
    assert body == {
        "sale_count": 0,
        "total_paise": 0,
        "subtotal_paise": 0,
        "discount_paise": 0,
        "tax_paise": 0,
        "by_method": [
            {"method": "cash", "sale_count": 0, "total_paise": 0},
            {"method": "upi", "sale_count": 0, "total_paise": 0},
            {"method": "card", "sale_count": 0, "total_paise": 0},
        ],
        "by_day": [],
        "by_cashier": [],
    }


def test_summary_totals_groups_and_filters(shirt, jacket, admin, cashier):
    a = _sell(cashier, [(shirt, 1)], SHIRT_TOTAL)
    b = _sell(cashier, [(shirt, 2), (jacket, 1)], 6057_90, method="upi", reference="UTR1")
    c = _sell(admin, [(jacket, 1)], JACKET_TOTAL, method="card", reference="4242")
    _at(a, 2026, 10, 18, 23, 30)
    _at(b, 2026, 10, 19, 10)
    _at(c, 2026, 10, 19, 18)
    client = _client(admin)

    body = client.get(SUMMARY_URL).json()
    assert body["sale_count"] == 3
    assert body["total_paise"] == SHIRT_TOTAL + 6057_90 + JACKET_TOTAL
    assert body["subtotal_paise"] == 1199_00 + 5398_00 + 3000_00
    assert body["total_paise"] == body["subtotal_paise"] - body["discount_paise"] + body["tax_paise"]
    assert body["by_method"] == [
        {"method": "cash", "sale_count": 1, "total_paise": SHIRT_TOTAL},
        {"method": "upi", "sale_count": 1, "total_paise": 6057_90},
        {"method": "card", "sale_count": 1, "total_paise": JACKET_TOTAL},
    ]
    assert body["by_day"] == [
        {"date": "2026-10-19", "sale_count": 2, "total_paise": 6057_90 + JACKET_TOTAL},
        {"date": "2026-10-18", "sale_count": 1, "total_paise": SHIRT_TOTAL},
    ]
    assert body["by_cashier"] == [
        {"cashier": cashier.pk, "cashier_name": "Test Cashier", "sale_count": 2, "total_paise": SHIRT_TOTAL + 6057_90},
        {"cashier": admin.pk, "cashier_name": "Test Admin", "sale_count": 1, "total_paise": JACKET_TOTAL},
    ]
    # Groups always add up to the headline figures.
    for group in ("by_method", "by_day", "by_cashier"):
        assert sum(row["total_paise"] for row in body[group]) == body["total_paise"]
        assert sum(row["sale_count"] for row in body[group]) == body["sale_count"]

    # Same filters as the list, so the summary describes exactly the listed bills.
    filtered = client.get(SUMMARY_URL, {"date_from": "2026-10-19", "cashier": cashier.pk}).json()
    assert (filtered["sale_count"], filtered["total_paise"]) == (1, 6057_90)
    assert _invoices(client.get(SALES_URL, {"date_from": "2026-10-19", "cashier": cashier.pk})) == [b]
    assert client.get(SUMMARY_URL, {"date_from": "2026-10-20", "date_to": "2026-10-19"}).status_code == 400


def test_summary_uses_saved_totals_not_current_prices(shirt, admin):
    _sell(admin, [(shirt, 1)], SHIRT_TOTAL)
    Product.objects.update(base_price_paise=9_999_00)
    TaxRule.objects.update(lower_rate_bp=2800)
    assert _client(admin).get(SUMMARY_URL).json()["total_paise"] == SHIRT_TOTAL


def test_cashier_filter_options_include_deactivated_staff(shirt, admin, cashier, senior):
    _sell(cashier, [(shirt, 1)], SHIRT_TOTAL)
    cashier.is_active = False
    cashier.save()
    body = _client(admin).get(CASHIERS_URL).json()
    # Only people who have sold something; deactivated accounts keep their history.
    assert body == [{"id": cashier.pk, "full_name": "Test Cashier", "role": "cashier", "is_active": False}]
