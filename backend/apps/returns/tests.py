"""Returns, refunds and voids: permissions, refund maths from the saved sale, stock, idempotency, the
sale staying unchanged, and races between returns and voids (PostgreSQL)."""

import threading
import uuid
from datetime import timedelta

import pytest
from django.db import connection
from django.utils import timezone

from apps.accounts.models import Role
from apps.audit.models import AuditEntry
from apps.catalog.models import Category, TaxRule
from apps.inventory.models import StockMovement
from apps.returns.models import Refund, Return, ReturnLine
from apps.returns.services import refund_for
from apps.sales.models import Payment, Sale, SaleLine
from apps.sales.test_api import _client, _product, _user, _variant
from apps.store.models import StoreSettings

RETURNS_URL = "/api/v1/returns/"
QUOTE_URL = "/api/v1/returns/quote/"
SALES_URL = "/api/v1/sales/"


@pytest.fixture
def admin(db):
    return _user(Role.ADMIN, pin="7391")


@pytest.fixture
def cashier(db):
    return _user(Role.CASHIER)


@pytest.fixture
def garments(db):
    return TaxRule.objects.create(
        name="Garments", kind="price_band", threshold_paise=2_500_00, lower_rate_bp=500, upper_rate_bp=1800
    )


@pytest.fixture
def shirts(garments):
    return Category.objects.create(name="Shirts", slug="shirts", hsn_code="6205", tax_rule=garments)


@pytest.fixture
def shirt(shirts):
    return _variant(_product(shirts), stock=10)


@pytest.fixture
def jacket(shirts):
    return _variant(_product(shirts, name="Linen Jacket", sku="JK-LN-001", price=3000_00), size="L", stock=5)


def _sell(user, lines, discount=None, method="cash"):
    """Complete a sale through the API, at the total the server quotes."""
    client = _client(user)
    body = {"lines": [{"variant": v.pk, "quantity": q} for v, q in lines], "discount": discount}
    total = client.post(f"{SALES_URL}quote/", body, format="json").json()["total_paise"]
    payment = {"method": "cash", "tendered_paise": total} if method == "cash" else {"method": method, "reference": "REF1"}
    response = client.post(
        SALES_URL, {**body, "payment": payment, "expected_total_paise": total}, format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )
    assert response.status_code == 201, response.json()
    return Sale.objects.get(invoice_no=response.json()["invoice_no"])


def _line(sale, variant):
    return sale.lines.get(variant=variant)


def _body(sale, items, method="cash", reference="", reason="size_fit", note=""):
    return {
        "invoice_no": sale.invoice_no,
        "reason": reason,
        "note": note,
        "lines": [{"sale_line": line.pk, "quantity": q, "disposition": d} for line, q, d in items],
        "refund": {"method": method, "reference": reference},
    }


def _return(user, sale, items, key=None, expected=None, **options):
    client = _client(user)
    body = _body(sale, items, **options)
    if expected is None:
        quote = client.post(QUOTE_URL, body, format="json")
        assert quote.status_code == 200, quote.json()
        expected = quote.json()["totals"]["total_paise"]
    return client.post(
        RETURNS_URL, {**body, "expected_total_paise": expected}, format="json", HTTP_IDEMPOTENCY_KEY=str(key or uuid.uuid4())
    )


def _on_hand(variant):
    variant.refresh_from_db()
    return variant.on_hand


def _snapshot(sale):
    """Everything a receipt shows, to prove a return or void leaves it as it was."""
    sale.refresh_from_db()
    lines = list(SaleLine.objects.filter(sale=sale).order_by("id").values())
    payment = Payment.objects.filter(sale=sale).values().get()
    figures = {f: getattr(sale, f) for f in ("subtotal_paise", "discount_paise", "taxable_paise", "tax_paise", "total_paise")}
    return lines, payment, figures


# --- Permissions: Admin only, enforced by the API (decision D1) ---


@pytest.mark.parametrize("role", [Role.CASHIER, Role.SENIOR_CASHIER])
def test_only_admins_can_use_returns_or_void(shirt, admin, role):
    sale = _sell(admin, [(shirt, 1)])
    client = _client(_user(role, email=f"{role}@x.example"))
    line = _line(sale, shirt)
    body = {**_body(sale, [(line, 1, "sellable")]), "expected_total_paise": 1}
    assert client.get(RETURNS_URL).status_code == 403
    assert client.post(RETURNS_URL, body, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4())).status_code == 403
    assert client.post(QUOTE_URL, body, format="json").status_code == 403
    assert client.get(f"{RETURNS_URL}invoice/{sale.invoice_no}/").status_code == 403
    assert client.post(f"{SALES_URL}{sale.invoice_no}/void/", {"reason": "x"}, format="json").status_code == 403
    assert not Return.objects.exists() and Sale.objects.get(pk=sale.pk).status == "completed"


def test_signed_out_requests_are_refused(db):
    from rest_framework.test import APIClient

    for url in (RETURNS_URL, f"{RETURNS_URL}invoice/LD-000001/", f"{RETURNS_URL}RET-000001/"):
        assert APIClient().get(url).status_code == 403


# --- Eligibility ---


def test_returnable_sale_lists_sold_returned_and_eligible(shirt, jacket, admin):
    sale = _sell(admin, [(shirt, 3), (jacket, 1)])
    assert _return(admin, sale, [(_line(sale, shirt), 1, "sellable")]).status_code == 201
    data = _client(admin).get(f"{RETURNS_URL}invoice/{sale.invoice_no.lower()}/").json()
    rows = {row["variant_sku"]: (row["quantity"], row["returned"], row["eligible"]) for row in data["lines"]}
    assert rows == {shirt.sku: (3, 1, 2), jacket.sku: (1, 0, 1)}
    assert data["can_return"] is True and data["refund_methods"] == ["cash"] and len(data["returns"]) == 1


def test_unknown_invoice_is_not_found(admin):
    assert _client(admin).get(f"{RETURNS_URL}invoice/LD-999999/").status_code == 404


def test_cannot_return_more_than_was_sold_less_returned(shirt, admin):
    sale = _sell(admin, [(shirt, 2)])
    line = _line(sale, shirt)
    assert _return(admin, sale, [(line, 1, "sellable")]).status_code == 201
    stock, movements = _on_hand(shirt), StockMovement.objects.count()
    response = _return(admin, sale, [(line, 2, "sellable")], expected=0)
    assert response.status_code == 400
    assert response.json()["fields"] == {"lines.0.quantity": ["Only 1 can still be returned."]}
    assert Return.objects.count() == 1 and _on_hand(shirt) == stock and StockMovement.objects.count() == movements
    assert _return(admin, sale, [(line, 1, "damaged")]).status_code == 201
    exhausted = _return(admin, sale, [(line, 1, "sellable")], expected=0)
    assert exhausted.json()["fields"] == {"lines.0.quantity": ["Every unit of this item was already returned."]}


def test_lines_must_belong_to_the_sale_and_appear_once(shirt, jacket, admin):
    sale = _sell(admin, [(shirt, 2)])
    other = _sell(admin, [(jacket, 1)])
    line = _line(sale, shirt)
    response = _return(admin, sale, [(line, 1, "sellable"), (line, 1, "sellable"), (_line(other, jacket), 1, "sellable")], expected=0)
    assert response.json()["fields"] == {
        "lines.1.sale_line": ["This item is listed twice. Combine the quantities."],
        "lines.2.sale_line": ["This item isn’t on that bill."],
    }


def test_other_reason_needs_a_note(shirt, admin):
    sale = _sell(admin, [(shirt, 1)])
    response = _return(admin, sale, [(_line(sale, shirt), 1, "sellable")], reason="other", expected=0)
    assert response.json()["fields"] == {"note": ["Say why the items came back."]}


# --- Refund maths: from the saved line, discount share included ---


def test_refund_uses_the_lines_saved_values_not_todays_price(shirt, admin):
    sale = _sell(admin, [(shirt, 2)], discount={"kind": "amount", "value": 100_00})
    line = _line(sale, shirt)
    shirt.product.base_price_paise = 9999_00
    shirt.product.save()
    StoreSettings.objects.filter(pk=1).update(prices_include_tax=True)
    quote = _client(admin).post(QUOTE_URL, _body(sale, [(line, 1, "sellable")]), format="json").json()
    # 2 × ₹1,199 less ₹100 = ₹2,298 after discount, 5% GST: one unit is half of each.
    assert quote["totals"] == {
        "subtotal_paise": 1199_00, "discount_paise": 50_00, "taxable_paise": 1149_00, "tax_paise": 57_45,
        "total_paise": 1206_45,
    }
    assert line.total_paise == 2412_90


def test_returning_units_one_at_a_time_refunds_exactly_the_line_total(shirt, admin):
    sale = _sell(admin, [(shirt, 3)], discount={"kind": "amount", "value": 100_00})
    line = _line(sale, shirt)
    assert (line.subtotal_paise - line.discount_paise, line.tax_paise, line.total_paise) == (3497_00, 174_85, 3671_85)
    totals = [_return(admin, sale, [(line, 1, "sellable")]).json()["total_paise"] for _ in range(3)]
    # ₹3,497.00 and ₹174.85 don't split evenly by 3: the paise land on different units, never lost or added.
    assert totals == [1223_95, 1223_95, 1223_95]
    assert sum(totals) == line.total_paise
    refunded = ReturnLine.objects.filter(sale_line=line)
    for field in ("subtotal_paise", "discount_paise", "taxable_paise", "tax_paise", "total_paise"):
        assert sum(getattr(r, field) for r in refunded) == getattr(line, field), field


@pytest.mark.parametrize("include_tax", [False, True])
@pytest.mark.parametrize("steps", [[1, 2, 4], [7], [3, 3, 1], [2, 5]])
def test_refund_shares_add_up_to_the_line_whatever_the_split(include_tax, steps):
    line = SaleLine(quantity=7, unit_price_paise=999_99, subtotal_paise=6999_93, discount_paise=333_33, tax_paise=0)
    after = line.subtotal_paise - line.discount_paise
    line.tax_paise = 33_333 if not include_tax else 31_746
    line.taxable_paise = after if not include_tax else after - line.tax_paise
    line.total_paise = line.taxable_paise + line.tax_paise
    done, parts = 0, []
    for quantity in steps:
        parts.append(refund_for(line, done, quantity, include_tax))
        done += quantity
    for field in ("subtotal_paise", "discount_paise", "taxable_paise", "tax_paise", "total_paise"):
        assert sum(getattr(p, field) for p in parts) == getattr(line, field), field
    for part in parts:
        assert part.subtotal_paise - part.discount_paise == (part.total_paise if include_tax else part.taxable_paise)
        assert min(part.discount_paise, part.taxable_paise, part.tax_paise) >= 0


def test_discount_share_follows_the_line_across_a_multi_line_bill(shirt, jacket, admin):
    sale = _sell(admin, [(shirt, 1), (jacket, 1)], discount={"kind": "percent", "value": 1000})
    jacket_line = _line(sale, jacket)
    ret = _return(admin, sale, [(jacket_line, 1, "sellable")]).json()
    assert ret["discount_paise"] == jacket_line.discount_paise
    assert ret["total_paise"] == jacket_line.total_paise and ret["tax_paise"] == jacket_line.tax_paise


def test_changed_refund_is_refused(shirt, admin):
    sale = _sell(admin, [(shirt, 1)])
    response = _return(admin, sale, [(_line(sale, shirt), 1, "sellable")], expected=1)
    assert response.status_code == 409 and response.json()["code"] == "refund_changed"
    assert not Return.objects.exists()


# --- Stock and disposition ---


def test_only_sellable_units_go_back_on_the_shelf(shirt, jacket, admin):
    sale = _sell(admin, [(shirt, 3), (jacket, 2)])
    shirt_before, jacket_before = _on_hand(shirt), _on_hand(jacket)
    line, jacket_line = _line(sale, shirt), _line(sale, jacket)
    response = _return(admin, sale, [(line, 2, "sellable"), (jacket_line, 1, "damaged")])
    assert response.status_code == 201
    number = response.json()["number"]
    assert _on_hand(shirt) == shirt_before + 2 and _on_hand(jacket) == jacket_before
    movement = StockMovement.objects.get(type=StockMovement.Type.RETURN)
    assert (movement.variant_id, movement.quantity_delta, movement.reference, movement.actor) == (shirt.pk, 2, number, admin)
    assert _return(admin, sale, [(line, 1, "inspection")]).status_code == 201
    assert _on_hand(shirt) == shirt_before + 2 and StockMovement.objects.filter(type="return").count() == 1


def test_return_keeps_the_sale_its_lines_and_payment_unchanged(shirt, jacket, admin):
    sale = _sell(admin, [(shirt, 2), (jacket, 1)], discount={"kind": "amount", "value": 50_00}, method="upi")
    before = _snapshot(sale)
    response = _return(admin, sale, [(_line(sale, shirt), 1, "sellable")], method="upi", reference="UTR-REFUND-1")
    assert response.status_code == 201
    assert _snapshot(sale) == before
    detail = _client(admin).get(f"{SALES_URL}{sale.invoice_no}/").json()
    assert detail["status"] == "completed" and detail["total_paise"] == sale.total_paise
    assert detail["return_state"] == "partial" and detail["returned_units"] == 1
    assert detail["refunded_paise"] == response.json()["total_paise"]
    assert [r["number"] for r in detail["returns"]] == [response.json()["number"]]


def test_return_state_is_derived_and_filterable(shirt, jacket, admin):
    sale = _sell(admin, [(shirt, 2)])
    untouched = _sell(admin, [(jacket, 1)])
    client = _client(admin)
    states = lambda state: [row["invoice_no"] for row in client.get(SALES_URL, {"return_state": state}).json()["results"]]
    _return(admin, sale, [(_line(sale, shirt), 1, "sellable")])
    assert states("partial") == [sale.invoice_no] and states("none") == [untouched.invoice_no] and states("returned") == []
    _return(admin, sale, [(_line(sale, shirt), 1, "damaged")])
    assert states("returned") == [sale.invoice_no] and states("partial") == []
    row = next(r for r in client.get(SALES_URL).json()["results"] if r["invoice_no"] == sale.invoice_no)
    assert row["return_state"] == "returned" and row["item_count"] == 2


# --- Refund records ---


def test_refund_is_a_separate_unverified_record(shirt, admin):
    sale = _sell(admin, [(shirt, 1)], method="card")
    response = _return(admin, sale, [(_line(sale, shirt), 1, "sellable")], method="card", reference="RFND-77")
    assert response.status_code == 201
    refund = Refund.objects.get()
    assert (refund.method, refund.amount_paise, refund.reference, refund.gateway_verified) == (
        "card", sale.total_paise, "RFND-77", False
    )
    assert response.json()["refund"]["gateway_verified"] is False


def test_refund_method_is_the_original_one_or_cash(shirt, admin):
    cash_sale = _sell(admin, [(shirt, 1)])
    line = _line(cash_sale, shirt)
    refused = _return(admin, cash_sale, [(line, 1, "sellable")], method="upi", reference="X", expected=0)
    assert refused.json()["fields"] == {"refund.method": ["This bill was paid in cash, so refund it in cash."]}
    upi_sale = _sell(admin, [(shirt, 1)], method="upi")
    upi_line = _line(upi_sale, shirt)
    card = _return(admin, upi_sale, [(upi_line, 1, "sellable")], method="card", reference="X", expected=0)
    assert card.json()["fields"] == {"refund.method": ["Refund this bill by UPI or in cash."]}
    missing = _return(admin, upi_sale, [(upi_line, 1, "sellable")], method="upi", expected=0)
    assert missing.json()["fields"] == {"refund.reference": ["Enter the UPI transaction ID."]}
    assert _return(admin, upi_sale, [(upi_line, 1, "sellable")], method="cash").status_code == 201


# --- Idempotency ---


def test_retried_return_is_recorded_once(shirt, admin):
    sale = _sell(admin, [(shirt, 2)])
    key = uuid.uuid4()
    first = _return(admin, sale, [(_line(sale, shirt), 1, "sellable")], key=key)
    stock = _on_hand(shirt)
    again = _return(admin, sale, [(_line(sale, shirt), 1, "sellable")], key=key, expected=first.json()["total_paise"])
    assert (first.status_code, again.status_code) == (201, 200)
    assert again.json()["number"] == first.json()["number"]
    assert Return.objects.count() == Refund.objects.count() == 1 and _on_hand(shirt) == stock
    assert AuditEntry.objects.filter(action="return.create").count() == 1


def test_reusing_a_key_for_a_different_return_is_refused(shirt, admin):
    sale = _sell(admin, [(shirt, 3)])
    key = uuid.uuid4()
    assert _return(admin, sale, [(_line(sale, shirt), 1, "sellable")], key=key).status_code == 201
    response = _return(admin, sale, [(_line(sale, shirt), 2, "sellable")], key=key)
    assert response.status_code == 409 and response.json()["code"] == "idempotency_key_reused"
    assert Return.objects.count() == 1


def test_return_needs_an_idempotency_key(shirt, admin):
    sale = _sell(admin, [(shirt, 1)])
    body = {**_body(sale, [(_line(sale, shirt), 1, "sellable")]), "expected_total_paise": sale.total_paise}
    response = _client(admin).post(RETURNS_URL, body, format="json")
    assert response.json()["fields"] == {"idempotency_key": ["Send a UUID Idempotency-Key header."]}


# --- List and detail ---


def test_return_list_filters_and_detail(shirt, jacket, admin):
    sale = _sell(admin, [(shirt, 2), (jacket, 1)])
    first = _return(admin, sale, [(_line(sale, shirt), 2, "sellable")]).json()["number"]
    second = _return(admin, sale, [(_line(sale, jacket), 1, "inspection")]).json()["number"]
    client = _client(admin)
    rows = client.get(RETURNS_URL).json()["results"]
    assert [r["number"] for r in rows] == [second, first]
    assert rows[1]["units"] == 2 and rows[1]["dispositions"] == ["sellable"] and rows[1]["invoice_no"] == sale.invoice_no
    held = client.get(RETURNS_URL, {"disposition": "inspection"}).json()["results"]
    assert [r["number"] for r in held] == [second]
    assert client.get(RETURNS_URL, {"q": sale.invoice_no}).json()["count"] == 2
    detail = client.get(f"{RETURNS_URL}{first}/").json()
    assert detail["invoice_no"] == sale.invoice_no and detail["lines"][0]["variant_sku"] == shirt.sku
    assert detail["lines"][0]["sold_quantity"] == 2 and detail["created_by_name"] == admin.full_name
    assert client.get(f"{RETURNS_URL}RET-999999/").status_code == 404


def test_returns_cannot_be_edited_or_deleted(shirt, admin):
    sale = _sell(admin, [(shirt, 1)])
    number = _return(admin, sale, [(_line(sale, shirt), 1, "sellable")]).json()["number"]
    for method in ("put", "patch", "delete"):
        assert getattr(_client(admin), method)(f"{RETURNS_URL}{number}/", {}, format="json").status_code == 405


# --- Voids ---


def test_void_restocks_and_keeps_the_sale_figures(shirt, jacket, admin, cashier):
    sale = _sell(cashier, [(shirt, 2), (jacket, 1)])
    before = _snapshot(sale)
    shirt_before, jacket_before = _on_hand(shirt), _on_hand(jacket)
    response = _client(admin).post(f"{SALES_URL}{sale.invoice_no}/void/", {"reason": "Rang up the wrong items"}, format="json")
    assert response.status_code == 200
    data = response.json()
    assert (data["status"], data["voided_by_name"], data["void_reason"]) == ("voided", admin.full_name, "Rang up the wrong items")
    lines, payment, figures = _snapshot(sale)
    assert (lines, payment, figures) == before
    assert _on_hand(shirt) == shirt_before + 2 and _on_hand(jacket) == jacket_before + 1
    movements = StockMovement.objects.filter(type=StockMovement.Type.VOID)
    assert {(m.variant_id, m.quantity_delta, m.reference) for m in movements} == {
        (shirt.pk, 2, sale.invoice_no), (jacket.pk, 1, sale.invoice_no)
    }
    entry = AuditEntry.objects.get(action="sale.void")
    assert (entry.actor, entry.target, entry.details["reason"]) == (admin, sale.invoice_no, "Rang up the wrong items")


def test_void_happens_once(shirt, admin):
    sale = _sell(admin, [(shirt, 1)])
    client = _client(admin)
    assert client.post(f"{SALES_URL}{sale.invoice_no}/void/", {"reason": "Mistake"}, format="json").status_code == 200
    stock = _on_hand(shirt)
    again = client.post(f"{SALES_URL}{sale.invoice_no}/void/", {"reason": "Mistake"}, format="json")
    assert again.status_code == 409 and again.json()["code"] == "already_voided"
    assert _on_hand(shirt) == stock and StockMovement.objects.filter(type="void").count() == 1


def test_void_needs_a_reason(shirt, admin):
    sale = _sell(admin, [(shirt, 1)])
    response = _client(admin).post(f"{SALES_URL}{sale.invoice_no}/void/", {"reason": "  "}, format="json")
    assert response.status_code == 400 and "reason" in response.json()["fields"]
    assert Sale.objects.get(pk=sale.pk).status == "completed"


def test_bill_with_returns_cannot_be_voided_and_a_voided_bill_cannot_be_returned(shirt, jacket, admin):
    returned = _sell(admin, [(shirt, 2)])
    _return(admin, returned, [(_line(returned, shirt), 1, "sellable")])
    response = _client(admin).post(f"{SALES_URL}{returned.invoice_no}/void/", {"reason": "x"}, format="json")
    assert response.status_code == 409 and response.json()["code"] == "void_not_allowed"
    voided = _sell(admin, [(jacket, 1)])
    _client(admin).post(f"{SALES_URL}{voided.invoice_no}/void/", {"reason": "x"}, format="json")
    refused = _return(admin, voided, [(_line(voided, jacket), 1, "sellable")], expected=0)
    assert refused.status_code == 409 and refused.json()["code"] == "sale_voided"
    data = _client(admin).get(f"{RETURNS_URL}invoice/{voided.invoice_no}/").json()
    assert data["can_return"] is False


def test_only_todays_bills_can_be_voided(shirt, admin):
    sale = _sell(admin, [(shirt, 1)])
    Sale.objects.filter(pk=sale.pk).update(created_at=timezone.now() - timedelta(days=1))
    response = _client(admin).post(f"{SALES_URL}{sale.invoice_no}/void/", {"reason": "x"}, format="json")
    assert response.status_code == 409 and "Only today’s bills" in response.json()["detail"]
    assert _return(admin, sale, [(_line(sale, shirt), 1, "sellable")]).status_code == 201


def test_voided_sales_are_filterable_and_leave_the_summary(shirt, admin):
    kept = _sell(admin, [(shirt, 1)])
    voided = _sell(admin, [(shirt, 1)])
    client = _client(admin)
    client.post(f"{SALES_URL}{voided.invoice_no}/void/", {"reason": "Duplicate bill"}, format="json")
    assert [r["invoice_no"] for r in client.get(SALES_URL, {"status": "voided"}).json()["results"]] == [voided.invoice_no]
    summary = client.get(f"{SALES_URL}summary/").json()
    assert summary["sale_count"] == 1 and summary["total_paise"] == kept.total_paise


# --- Audit trail ---


def test_audit_entries_are_append_only(shirt, admin):
    sale = _sell(admin, [(shirt, 1)])
    _client(admin).post(f"{SALES_URL}{sale.invoice_no}/void/", {"reason": "Mistake"}, format="json")
    entry = AuditEntry.objects.get()
    entry.summary = "rewritten"
    with pytest.raises(TypeError):
        entry.save()
    with pytest.raises(TypeError):
        entry.delete()
    with pytest.raises(TypeError):
        AuditEntry.objects.update(summary="rewritten")
    with pytest.raises(TypeError):
        AuditEntry.objects.all().delete()
    assert AuditEntry.objects.get().summary.startswith("Voided")


def test_return_audit_summary_reads_plainly(shirt, admin):
    sale = _sell(admin, [(shirt, 2)])
    response = _return(admin, sale, [(_line(sale, shirt), 1, "sellable")])
    entry = AuditEntry.objects.get(action="return.create")
    total = response.json()["total_paise"]
    assert entry.summary == f"{response.json()['number']} for {sale.invoice_no}: 1 unit, refund ₹{total / 100:,.2f} by Cash"
    assert entry.details["invoice_no"] == sale.invoice_no and entry.details["refund_paise"] == total


def test_audit_refuses_credentials(admin):
    from apps.audit import services as audit

    with pytest.raises(ValueError):
        audit.record(admin, AuditEntry.Action.STAFF_PIN_SET, "x@example.com", "PIN set", pin="1234")
    assert not AuditEntry.objects.exists()


# --- Races (PostgreSQL row locks and real concurrent connections) ---

needs_postgres = pytest.mark.skipif(
    connection.vendor != "postgresql", reason="Needs Postgres row locks and real concurrent connections"
)


def _race(*calls):
    barrier = threading.Barrier(len(calls))
    results = [None] * len(calls)

    def run(index, call):
        barrier.wait()
        try:
            results[index] = call()
        finally:
            connection.close()

    threads = [threading.Thread(target=run, args=(i, call)) for i, call in enumerate(calls)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    return results


@pytest.fixture
def race_setup(transactional_db):
    rule = TaxRule.objects.create(name="Flat", kind="flat", flat_rate_bp=500)
    category = Category.objects.create(name="Shirts", slug="shirts", hsn_code="6205", tax_rule=rule)
    variant = _variant(_product(category, price=1000_00), stock=5)
    admins = [_user(Role.ADMIN, email=f"a{i}@example.com") for i in range(4)]
    StoreSettings.load()
    return variant, admins


@needs_postgres
def test_simultaneous_returns_of_the_last_unit_refund_once(race_setup):
    variant, admins = race_setup
    sale = _sell(admins[0], [(variant, 1)])
    line = _line(sale, variant)
    stock = _on_hand(variant)
    results = _race(*[lambda user=user: _return(user, sale, [(line, 1, "sellable")], expected=1050_00) for user in admins])
    assert sorted(r.status_code for r in results) == [201, 400, 400, 400]
    assert Return.objects.count() == Refund.objects.count() == 1
    assert _on_hand(variant) == stock + 1 and StockMovement.objects.filter(type="return").count() == 1


@needs_postgres
def test_simultaneous_partial_returns_never_exceed_what_was_sold(race_setup):
    variant, admins = race_setup
    sale = _sell(admins[0], [(variant, 3)])
    line = _line(sale, variant)
    stock = _on_hand(variant)
    results = _race(*[lambda user=user: _return(user, sale, [(line, 2, "sellable")], expected=2100_00) for user in admins])
    assert sorted(r.status_code for r in results) == [201, 400, 400, 400]
    assert sum(ReturnLine.objects.values_list("quantity", flat=True)) == 2 and _on_hand(variant) == stock + 2


@needs_postgres
def test_simultaneous_retries_with_one_key_refund_once(race_setup):
    variant, admins = race_setup
    sale = _sell(admins[0], [(variant, 2)])
    line = _line(sale, variant)
    key = uuid.uuid4()
    stock = _on_hand(variant)
    results = _race(*[lambda: _return(admins[0], sale, [(line, 1, "sellable")], key=key, expected=1050_00) for _ in range(4)])
    assert sorted(r.status_code for r in results) == [200, 200, 200, 201]
    assert len({r.json()["number"] for r in results}) == 1
    assert Return.objects.count() == Refund.objects.count() == 1 and _on_hand(variant) == stock + 1


@needs_postgres
def test_a_void_and_a_return_racing_for_one_bill_cannot_both_happen(race_setup):
    variant, admins = race_setup
    for _ in range(5):
        sale = _sell(admins[0], [(variant, 1)])
        line = _line(sale, variant)
        stock = _on_hand(variant)
        void = lambda: _client(admins[1]).post(f"{SALES_URL}{sale.invoice_no}/void/", {"reason": "Race"}, format="json")
        ret = lambda: _return(admins[2], sale, [(line, 1, "sellable")], expected=1050_00)
        voided, returned = _race(void, ret)
        sale.refresh_from_db()
        if sale.status == "voided":
            assert (voided.status_code, returned.status_code, returned.json()["code"]) == (200, 409, "sale_voided")
            assert not Return.objects.filter(sale=sale).exists()
        else:
            assert (returned.status_code, voided.status_code, voided.json()["code"]) == (201, 409, "void_not_allowed")
            assert Return.objects.filter(sale=sale).count() == 1
        assert _on_hand(variant) == stock + 1
        assert StockMovement.objects.filter(reference__in=[sale.invoice_no, *Return.objects.filter(sale=sale).values_list("number", flat=True)], quantity_delta__gt=0).count() == 1


@needs_postgres
def test_simultaneous_voids_restock_once(race_setup):
    variant, admins = race_setup
    sale = _sell(admins[0], [(variant, 2)])
    stock = _on_hand(variant)
    results = _race(
        *[lambda user=user: _client(user).post(f"{SALES_URL}{sale.invoice_no}/void/", {"reason": "Race"}, format="json") for user in admins]
    )
    assert sorted(r.status_code for r in results) == [200, 409, 409, 409]
    assert _on_hand(variant) == stock + 2 and StockMovement.objects.filter(type="void").count() == 1
