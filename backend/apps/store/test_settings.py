"""Store settings: admin-only edits, validation, the audit trail, and what a change does to bills."""

import uuid

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.audit.models import AuditEntry
from apps.catalog.models import Category, Product, TaxRule, Variant
from apps.inventory.models import StockMovement
from apps.inventory.services import record_movement
from apps.sales.models import Sale
from apps.store.gst import STATES, check_character, gstin_problem
from apps.store.models import StoreSettings

URL = "/api/v1/store/settings/"
# Checksum-valid GSTINs for Kerala (32) and Maharashtra (27).
KERALA_GSTIN = "32AAAAA0000A1Z" + check_character("32AAAAA0000A1Z")
MAHARASHTRA_GSTIN = "27AAPFU0939F1ZV"


def _user(role, email=None):
    return User.objects.create_user(email=email or f"{role}@example.com", password="x", full_name=f"Test {role}".title(), role=role)


def _client(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.fixture
def admin(db):
    return _user(Role.ADMIN, email="owner@example.com")


@pytest.fixture
def api(admin):
    StoreSettings.load()
    return _client(admin)


@pytest.fixture
def shirt(db):
    rule = TaxRule.objects.create(name="Flat 5%", kind="flat", flat_rate_bp=500)
    category = Category.objects.create(name="Shirts", slug="shirts", hsn_code="6205", tax_rule=rule)
    product = Product.objects.create(name="Shirt", sku="SH-1", category=category, base_price_paise=1000_00, cost_price_paise=500_00)
    variant = Variant.objects.create(product=product, size="M", colour="Blue", sku="SH-1-M-BLU")
    record_movement(variant=variant, type=StockMovement.Type.OPENING, quantity_delta=10)
    return variant


def _quote(client, variant, discount=None):
    body = {"lines": [{"variant": variant.pk, "quantity": 1}], **({"discount": discount} if discount else {})}
    response = client.post("/api/v1/sales/quote/", body, format="json")
    assert response.status_code == 200, response.json()
    return response.json()


def _checkout(client, variant, total, discount=None):
    body = {
        "lines": [{"variant": variant.pk, "quantity": 1}],
        "payment": {"method": "cash", "tendered_paise": 5000_00},
        "expected_total_paise": total,
        **({"discount": discount} if discount else {}),
    }
    return client.post("/api/v1/sales/", body, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()))


# --- GSTIN checks ---


def test_gstin_checksum_matches_published_examples():
    assert check_character("27AAPFU0939F1Z") == "V"
    assert check_character("29AAGCB7383J1Z") == "4"


@pytest.mark.parametrize(
    "gstin,state,problem",
    [
        (KERALA_GSTIN, "Kerala", None),
        (MAHARASHTRA_GSTIN, "Maharashtra", None),
        (MAHARASHTRA_GSTIN, "Kerala", "starts with 32"),
        (KERALA_GSTIN[:14] + ("A" if KERALA_GSTIN[14] != "A" else "B"), "Kerala", "doesn’t match"),
        ("32AAAAA0000A1X5", "Kerala", "15 characters"),
        ("32AAAAA0000", "Kerala", "15 characters"),
    ],
)
def test_gstin_problems(gstin, state, problem):
    found = gstin_problem(gstin, state)
    assert (found is None) if problem is None else (problem in found)


# --- Access ---


@pytest.mark.parametrize("role", [Role.CASHIER, Role.SENIOR_CASHIER, None])
def test_only_admins_read_or_change_settings(db, role):
    StoreSettings.load()
    client = _client(_user(role)) if role else APIClient()
    assert client.get(URL).status_code == 403
    assert client.patch(URL, {"cashier_discount_limit_pct": 100}, format="json").status_code == 403
    assert StoreSettings.load().cashier_discount_limit_pct == 10
    assert not AuditEntry.objects.exists()


def test_the_shell_store_endpoint_still_hides_pricing(api):
    assert set(api.get("/api/v1/store/").json()) == {"name", "code", "state", "today"}


# --- Reading and changing ---


def test_settings_show_every_editable_field_and_the_state_list(api):
    body = api.get(URL).json()
    assert body == {
        "name": "Loom & Linen",
        "code": "LL-KKD-01",
        "address": "Beach Road, Kozhikode, Kerala",
        "state": "Kerala",
        "gstin": "",
        "prices_include_tax": False,
        "cashier_discount_limit_pct": 10,
        "states": STATES,
    }


def test_a_change_is_saved_and_audited_with_before_and_after(api, admin):
    response = api.patch(URL, {"name": "Loom & Linen Kozhikode", "gstin": KERALA_GSTIN.lower(), "code": "ll-kkd-02"}, format="json")
    assert response.status_code == 200, response.json()
    assert (response.json()["gstin"], response.json()["code"]) == (KERALA_GSTIN, "LL-KKD-02")
    entry = AuditEntry.objects.get()
    assert entry.action == "settings.update" and entry.actor == admin and entry.target == "store"
    assert entry.details["changes"] == {
        "name": ["Loom & Linen", "Loom & Linen Kozhikode"],
        "gstin": ["", KERALA_GSTIN],
        "code": ["LL-KKD-01", "LL-KKD-02"],
    }
    assert entry.summary == "Changed store name, store code, GSTIN"


def test_saving_the_same_values_writes_no_audit_entry(api):
    assert api.patch(URL, {"name": "Loom & Linen", "cashier_discount_limit_pct": 10}, format="json").status_code == 200
    assert not AuditEntry.objects.exists()


@pytest.mark.parametrize(
    "body,field",
    [
        ({"cashier_discount_limit_pct": 101}, "cashier_discount_limit_pct"),
        ({"cashier_discount_limit_pct": -1}, "cashier_discount_limit_pct"),
        ({"name": ""}, "name"),
        ({"code": "LL KKD"}, "code"),
        ({"state": "Atlantis"}, "state"),
        ({"gstin": MAHARASHTRA_GSTIN}, "gstin"),
        ({"gstin": "NOT-A-GSTIN"}, "gstin"),
        ({"address": "x" * 301}, "address"),
    ],
)
def test_invalid_settings_are_refused_whole(api, body, field):
    response = api.patch(URL, {"name": "Changed", **body}, format="json")
    assert response.status_code == 400
    assert field in response.json()["fields"]
    assert StoreSettings.load().name == "Loom & Linen"
    assert not AuditEntry.objects.exists()


def test_moving_state_checks_the_existing_gstin(api):
    api.patch(URL, {"gstin": KERALA_GSTIN}, format="json")
    response = api.patch(URL, {"state": "Maharashtra"}, format="json")
    assert response.status_code == 400 and "starts with 27" in response.json()["fields"]["state"][0]
    assert api.patch(URL, {"state": "Maharashtra", "gstin": MAHARASHTRA_GSTIN}, format="json").status_code == 200


def test_an_unlisted_state_already_saved_can_stay(api):
    StoreSettings.objects.filter(pk=1).update(state="Kerala State")
    assert api.patch(URL, {"name": "Renamed", "state": "Kerala State"}, format="json").status_code == 200


# --- What a change does to bills ---


def test_past_receipts_keep_their_store_details_and_pricing(api, shirt):
    cashier = _client(_user(Role.CASHIER))
    total = _quote(cashier, shirt)["total_paise"]
    sale = _checkout(cashier, shirt, total).json()
    api.patch(
        URL,
        {"name": "New Name", "address": "MG Road", "gstin": KERALA_GSTIN, "prices_include_tax": True, "cashier_discount_limit_pct": 50},
        format="json",
    )
    receipt = cashier.get(f"/api/v1/sales/{sale['invoice_no']}/").json()
    assert receipt == sale
    assert receipt["store"]["name"] == "Loom & Linen" and receipt["store"]["gstin"] == ""
    assert Sale.objects.get().prices_include_tax is False


def test_switching_to_tax_inclusive_prices_changes_new_bills(api, shirt):
    cashier = _client(_user(Role.CASHIER))
    assert _quote(cashier, shirt)["total_paise"] == 1050_00
    api.patch(URL, {"prices_include_tax": True}, format="json")
    assert _quote(cashier, shirt)["total_paise"] == 1000_00


def test_a_bill_priced_before_the_change_is_stopped_at_checkout(api, shirt):
    cashier = _client(_user(Role.CASHIER))
    shown = _quote(cashier, shirt)["total_paise"]
    api.patch(URL, {"prices_include_tax": True}, format="json")
    response = _checkout(cashier, shirt, shown)
    assert response.status_code == 409 and response.json()["code"] == "total_changed"
    assert not Sale.objects.exists()
    assert _checkout(cashier, shirt, _quote(cashier, shirt)["total_paise"]).status_code == 201


def test_lowering_the_discount_limit_applies_to_bills_on_the_till(api, shirt):
    cashier = _client(_user(Role.CASHIER))
    discount = {"kind": "percent", "value": 1000}
    quote = _quote(cashier, shirt, discount)
    assert quote["needs_approval"] is False
    api.patch(URL, {"cashier_discount_limit_pct": 5}, format="json")
    assert _quote(cashier, shirt, discount)["needs_approval"] is True
    response = _checkout(cashier, shirt, quote["total_paise"], discount)
    assert response.status_code == 400 and "approval_pin" in response.json()["fields"]
    assert not Sale.objects.exists()


def test_billing_settings_follow_the_change(api, shirt):
    cashier = _client(_user(Role.CASHIER))
    api.patch(URL, {"name": "Loom & Linen Calicut", "cashier_discount_limit_pct": 15}, format="json")
    body = cashier.get("/api/v1/billing/settings/").json()
    assert (body["store_name"], body["cashier_discount_limit_pct"]) == ("Loom & Linen Calicut", 15)
