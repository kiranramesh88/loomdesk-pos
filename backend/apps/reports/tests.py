"""Reports: admin-only access, figures that reconcile with the saved sales, returns, refunds, voids, tax and
stock, store-date boundaries, and a CSV export that is safe to open in a spreadsheet."""

import csv
import io
from datetime import datetime, time, timedelta

import pytest
from django.utils import timezone

from apps.accounts.models import Role
from apps.audit.models import AuditEntry
from apps.catalog.models import Category, Product, TaxRule, Variant
from apps.inventory.views import LOW, OUT, SELLABLE
from apps.returns.models import Refund, Return
from apps.returns.tests import _line, _return, _sell
from apps.sales.models import Sale, SaleLine
from apps.sales.test_api import _client, _product, _user, _variant

from .exporting import _cell

URL = "/api/v1/reports/"


@pytest.fixture
def admin(db):
    return _user(Role.ADMIN, pin="7391")


@pytest.fixture
def cashier(db):
    return _user(Role.CASHIER)


@pytest.fixture
def shirts(db):
    rule = TaxRule.objects.create(name="Garments", kind="price_band", threshold_paise=2_500_00, lower_rate_bp=500, upper_rate_bp=1800)
    return Category.objects.create(name="Shirts", slug="shirts", hsn_code="6205", tax_rule=rule)


@pytest.fixture
def bags(db):
    rule = TaxRule.objects.create(name="Standard", kind="flat", flat_rate_bp=1800)
    return Category.objects.create(name="Bags", slug="bags", hsn_code="4202", tax_rule=rule)


@pytest.fixture
def shirt(shirts):
    return _variant(_product(shirts), stock=10)


@pytest.fixture
def jacket(shirts):
    return _variant(_product(shirts, name="Linen Jacket", sku="JK-LN-001", price=3000_00), size="L", stock=5)


@pytest.fixture
def tote(bags):
    return _variant(_product(bags, name="Jute Tote", sku="BG-JT-001", price=450_00), size="One", stock=8)


@pytest.fixture
def day(admin, cashier, shirt, jacket, tote):
    """A store day: three completed bills (cash, UPI with a discount, card), one void and a partial return."""
    a = _sell(cashier, [(shirt, 2), (tote, 1)])
    b = _sell(admin, [(jacket, 1), (shirt, 1)], discount={"kind": "percent", "value": 5}, method="upi")
    c = _sell(cashier, [(tote, 2)], method="card")
    voided = _sell(cashier, [(shirt, 1)])
    assert _client(admin).post(f"/api/v1/sales/{voided.invoice_no}/void/", {"reason": "Wrong items"}, format="json").status_code == 200
    ret = _return(admin, a, [(_line(a, shirt), 1, "sellable"), (_line(a, tote), 1, "damaged")])
    assert ret.status_code == 201, ret.json()
    return {"sales": [a, b, c], "voided": voided, "return": Return.objects.get(number=ret.json()["number"])}


def _get(user, key, **params):
    response = _client(user).get(f"{URL}{key}/", params)
    assert response.status_code == 200, response.json()
    return response.json()


def _metrics(report):
    return {m["key"]: m["value"] for m in report["summary"]}


def _move(obj, when):
    """Back-date a record (test only), as if it had been written at `when` store time."""
    type(obj).objects.filter(pk=obj.pk).update(created_at=timezone.make_aware(when))


# --- Access ---


@pytest.mark.parametrize("role", [Role.CASHIER, Role.SENIOR_CASHIER])
def test_reports_are_admin_only(db, role):
    client = _client(_user(role, email=f"{role}@x.example"))
    for path in ("", "sales-summary/", "inventory-valuation/", "inventory-valuation/export/", "activity/"):
        assert client.get(f"{URL}{path}").status_code == 403, path


def test_reports_need_a_session(db):
    from rest_framework.test import APIClient

    for path in ("", "sales-summary/", "sales-summary/export/"):
        assert APIClient().get(f"{URL}{path}").status_code in (401, 403)


def test_library_lists_every_report(admin):
    keys = [r["key"] for r in _client(admin).get(URL).json()]
    assert keys == [
        "sales-summary", "sales-by-product", "sales-by-staff", "payment-methods", "returns",
        "voids", "tax-summary", "inventory-valuation", "low-stock", "activity",
    ]
    for key in keys:
        report = _get(admin, key)
        assert report["definitions"], key
        assert {c["key"] for c in report["columns"]} >= set().union(*(r.keys() for r in report["rows"])) - {"variant_id"}, key


def test_unknown_report_and_bad_filters(admin):
    client = _client(admin)
    missing = client.get(f"{URL}profit/")
    assert missing.status_code == 404 and missing.json()["code"] == "not_found"
    assert client.get(f"{URL}low-stock/", {"state": "everything"}).json()["fields"] == {"state": ["Choose one of the listed options."]}
    assert client.get(f"{URL}activity/", {"action": "staff.password"}).status_code == 400


def test_dates_are_checked(admin):
    client = _client(admin)
    assert client.get(f"{URL}sales-summary/", {"date_from": "20-10-2026"}).json()["fields"]["date_from"]
    assert client.get(f"{URL}sales-summary/", {"date_from": "2026-10-20", "date_to": "2026-10-01"}).json()["fields"]["date_to"]
    assert client.get(f"{URL}sales-summary/", {"date_from": "2025-01-01", "date_to": "2026-10-01"}).json()["fields"]["date_from"]
    today = timezone.localdate()
    period = _get(admin, "sales-summary")["period"]
    assert period == {"date_from": str(today - timedelta(days=29)), "date_to": str(today)}
    assert _get(admin, "inventory-valuation")["period"] is None


# --- Reconciliation with the saved records ---


def test_sales_summary_reconciles(admin, day):
    sales, voided, ret = day["sales"], day["voided"], day["return"]
    m = _metrics(_get(admin, "sales-summary"))
    assert m["bills"] == 3
    assert m["sales"] == sum(s.total_paise for s in sales)
    assert m["gross"] == sum(s.subtotal_paise for s in sales)
    assert m["discounts"] == sum(s.discount_paise for s in sales) > 0
    assert m["gst"] == sum(s.tax_paise for s in sales)
    assert m["refunds"] == ret.refund.amount_paise == ret.total_paise
    assert m["net"] == m["sales"] - m["refunds"]
    assert m["average"] == m["sales"] // 3
    assert (m["voided_bills"], m["voided_paise"]) == (1, voided.total_paise)
    # Prices exclude GST here, so the parts add up to the bill totals.
    assert m["gross"] - m["discounts"] + m["gst"] == m["sales"]
    today = [r for r in _get(admin, "sales-summary")["rows"] if r["date"] == str(timezone.localdate())]
    assert today == [{"date": str(timezone.localdate()), "bills": 3, "sales": m["sales"], "refunds": m["refunds"], "net": m["net"]}]


def test_every_report_agrees_with_the_summary(admin, day):
    summary = _metrics(_get(admin, "sales-summary"))
    product = _metrics(_get(admin, "sales-by-product"))
    staff = _metrics(_get(admin, "sales-by-staff"))
    methods = _metrics(_get(admin, "payment-methods"))
    returns = _metrics(_get(admin, "returns"))
    assert product["sales"] == staff["sales"] == methods["sales"] == summary["sales"]
    assert product["refunds"] == methods["refunds"] == returns["refunds"] == summary["refunds"]
    assert product["net"] == methods["net"] == summary["net"]
    assert staff["bills"] == summary["bills"]
    assert staff["discounts"] == summary["discounts"]
    assert product["units"] == sum(SaleLine.objects.filter(sale__in=day["sales"]).values_list("quantity", flat=True)) == 7


def test_sales_by_product_counts_units_and_returns(admin, day):
    rows = {r["sku"]: r for r in _get(admin, "sales-by-product")["rows"]}
    assert (rows["SH-CT-001"]["units"], rows["SH-CT-001"]["units_returned"]) == (3, 1)
    assert (rows["BG-JT-001"]["units"], rows["BG-JT-001"]["units_returned"]) == (3, 1)
    for row in rows.values():
        assert row["net"] == row["sales"] - row["refunds"]
    shirts = Category.objects.get(slug="shirts")
    filtered = _get(admin, "sales-by-product", category=str(shirts.pk))
    assert {r["sku"] for r in filtered["rows"]} == {"SH-CT-001", "JK-LN-001"}
    assert filtered["applied"] == {"category": str(shirts.pk)}


def test_sales_by_staff_includes_voids_and_approvals(admin, cashier, day):
    rows = {r["staff"]: r for r in _get(admin, "sales-by-staff")["rows"]}
    assert rows[cashier.full_name]["bills"] == 2
    assert rows[cashier.full_name]["voided_bills"] == 1
    assert rows[admin.full_name]["bills"] == 1
    assert rows[admin.full_name]["discounts"] == day["sales"][1].discount_paise


def test_payment_methods_and_cash_expected(admin, day):
    report = _get(admin, "payment-methods")
    rows = {r["method_label"]: r for r in report["rows"]}
    a, b, c = day["sales"]
    assert (rows["Cash"]["sales"], rows["UPI"]["sales"], rows["Card"]["sales"]) == (a.total_paise, b.total_paise, c.total_paise)
    assert rows["Cash"]["refunds"] == day["return"].refund.amount_paise
    assert _metrics(report)["cash_expected"] == a.total_paise - day["return"].refund.amount_paise
    assert "not verified" in " ".join(x["meaning"] for x in report["definitions"]).replace("aren’t verified", "not verified")


def test_returns_report_lists_dispositions(admin, day):
    report = _get(admin, "returns")
    [row] = report["rows"]
    assert row["number"] == day["return"].number and row["invoice_no"] == day["sales"][0].invoice_no
    assert (row["units"], row["restocked"], row["damaged"], row["held"]) == (2, 1, 1, 0)
    assert row["refund_method"] == "Cash"
    assert _get(admin, "returns", reason="defect")["rows"] == []


def test_voids_report(admin, day):
    [row] = _get(admin, "voids")["rows"]
    assert (row["invoice_no"], row["reason"], row["total"]) == (day["voided"].invoice_no, "Wrong items", day["voided"].total_paise)


def test_tax_summary_nets_returns_and_splits_gst(admin, day):
    report = _get(admin, "tax-summary")
    rows = {(r["hsn_code"], r["rate"]): r for r in report["rows"]}
    sold = SaleLine.objects.filter(sale__in=day["sales"])
    assert set(rows) == set(sold.values_list("hsn_code", "tax_rate_bp"))
    for (hsn, rate), row in rows.items():
        lines = sold.filter(hsn_code=hsn, tax_rate_bp=rate)
        assert row["taxable"] == sum(lines.values_list("taxable_paise", flat=True))
        assert row["gst"] == sum(lines.values_list("tax_paise", flat=True))
        assert row["net_gst"] == row["gst"] - row["returned_gst"] == row["cgst"] + row["sgst"]
        assert row["sgst"] - row["cgst"] in (0, 1)
    m = _metrics(report)
    assert m["net_gst"] == sum(s.tax_paise for s in day["sales"]) - day["return"].tax_paise
    assert m["net_taxable"] == sum(s.taxable_paise for s in day["sales"]) - day["return"].taxable_paise


# --- Dates ---


def test_refunds_count_on_the_return_date(admin, day):
    today = timezone.localdate()
    yesterday = today - timedelta(days=1)
    for sale in day["sales"] + [day["voided"]]:
        _move(sale, datetime.combine(yesterday, time(12)))
    on_sale_day = _metrics(_get(admin, "sales-summary", date_from=yesterday, date_to=yesterday))
    on_return_day = _metrics(_get(admin, "sales-summary", date_from=today, date_to=today))
    assert on_sale_day["refunds"] == 0 and on_sale_day["bills"] == 3
    assert on_return_day["bills"] == 0
    assert on_return_day["net"] == -day["return"].refund.amount_paise
    assert _get(admin, "returns", date_from=yesterday, date_to=yesterday)["rows"] == []


def test_store_date_boundaries_use_india_time(admin, day):
    a = day["sales"][0]
    late = datetime(2026, 3, 9, 23, 30)  # 18:00 UTC: still 9 March in Kozhikode
    _move(a, late)
    on_ninth = _metrics(_get(admin, "sales-summary", date_from="2026-03-09", date_to="2026-03-09"))
    assert (on_ninth["bills"], on_ninth["sales"]) == (1, a.total_paise)
    assert _metrics(_get(admin, "sales-summary", date_from="2026-03-10", date_to="2026-03-10"))["bills"] == 0


# --- Stock snapshots ---


def test_inventory_valuation(admin, shirts, shirt, jacket):
    kurta = _product(shirts, name="Sample Kurta", sku="KU-SM-001", price=899_00)
    Product.objects.filter(pk=kurta.pk).update(cost_price_paise=None)
    no_cost = _variant(kurta, stock=2)
    hidden = _variant(_product(shirts, name="Old Shirt", sku="SH-OLD-001", status=Product.Status.INACTIVE), stock=4)
    report = _get(admin, "inventory-valuation")
    rows = {r["sku"]: r for r in report["rows"]}
    assert hidden.sku not in rows
    assert rows[shirt.sku]["cost_value"] == 620_00 * 10 and rows[shirt.sku]["retail_value"] == 1199_00 * 10
    assert rows[no_cost.sku]["cost_value"] is None
    m = _metrics(report)
    assert m["cost_value"] == 620_00 * 15
    assert m["retail_value"] == 1199_00 * 10 + 3000_00 * 5 + 899_00 * 2
    assert m["no_cost"] == 1


def test_cost_prices_stay_with_admins(cashier, shirt):
    # The only report with cost prices: a cashier gets neither the JSON nor the CSV.
    client = _client(cashier)
    assert client.get(f"{URL}inventory-valuation/").status_code == 403
    assert client.get(f"{URL}inventory-valuation/export/").status_code == 403


def test_low_stock_matches_the_inventory_summary(admin, shirts, shirt):
    low = _variant(_product(shirts, name="Low Kurta", sku="KU-LW-001"), stock=1)
    empty = _variant(_product(shirts, name="Empty Kurta", sku="KU-EM-001"), stock=0)
    report = _get(admin, "low-stock")
    assert [r["sku"] for r in report["rows"]] == [empty.sku, low.sku]
    tracked = Variant.objects.filter(SELLABLE)
    assert _metrics(report) == {"low_stock": tracked.filter(LOW).count(), "out_of_stock": tracked.filter(OUT).count()}
    assert [r["sku"] for r in _get(admin, "low-stock", state="out_of_stock")["rows"]] == [empty.sku]


# --- Activity log ---


def test_activity_log_shows_summaries_only(admin, day):
    report = _get(admin, "activity")
    actions = [r["action"] for r in report["rows"]]
    assert actions == ["Return recorded", "Sale voided"]
    assert all(set(r) == {"created_at", "action", "actor", "target", "summary"} for r in report["rows"])
    assert [r["action"] for r in _get(admin, "activity", action="sale.void")["rows"]] == ["Sale voided"]
    assert AuditEntry.objects.count() == 2


# --- CSV ---


def test_csv_export(admin, day):
    response = _client(admin).get(f"{URL}payment-methods/export/", {"date_from": "2026-01-01", "date_to": str(timezone.localdate())})
    assert response.status_code == 200
    assert response["Content-Type"] == "text/csv; charset=utf-8"
    assert response["Content-Disposition"] == f'attachment; filename="loomdesk-payment-methods-2026-01-01-to-{timezone.localdate()}.csv"'
    assert response["Cache-Control"] == "no-store"
    text = response.content.decode("utf-8")
    assert text.startswith("﻿")
    rows = list(csv.reader(io.StringIO(text[1:])))
    assert rows[0] == ["Method", "Bills", "Sales (₹)", "Refunds", "Refunded (₹)", "Net recorded (₹)"]
    cash = day["sales"][0].total_paise
    assert rows[1][:3] == ["Cash", "1", f"{cash // 100}.{cash % 100:02d}"]
    assert len(rows) == 4


def test_csv_matches_the_json_rows(admin, day):
    report = _get(admin, "tax-summary")
    text = _client(admin).get(f"{URL}tax-summary/export/").content.decode("utf-8")[1:]
    rows = list(csv.reader(io.StringIO(text)))
    assert len(rows) == len(report["rows"]) + 1
    net_gst = rows[0].index("Net GST (₹)")
    assert sum(round(float(r[net_gst]) * 100) for r in rows[1:]) == _metrics(report)["net_gst"]
    assert rows[1][rows[0].index("Rate (%)")] in ("5.00", "18.00")


def test_csv_quotes_formula_like_text(admin, shirts):
    sneaky = _variant(_product(shirts, name='=HYPERLINK("http://x.example","Shirt")', sku="SH-XX-001"), stock=1)
    _sell(admin, [(sneaky, 1)])
    text = _client(admin).get(f"{URL}sales-by-product/export/").content.decode("utf-8")
    assert '"\'=HYPERLINK(""http://x.example"",""Shirt"")"' in text


def test_cell_formats():
    assert _cell(-450, "money") == "-4.50"
    assert _cell(5, "money") == "0.05"
    assert _cell(123456, "money") == "1234.56"
    assert _cell(None, "money") == ""
    assert _cell(500, "percent") == "5.00"
    assert _cell(-3, "count") == "-3"
    assert _cell("+91 98470", "text") == "'+91 98470"
    assert _cell("@sum", "text") == "'@sum"
    assert _cell("Linen", "text") == "Linen"


def test_reports_write_nothing(admin, day):
    counts = (Sale.objects.count(), Return.objects.count(), Refund.objects.count(), AuditEntry.objects.count())
    for key in ("sales-summary", "returns", "activity"):
        _get(admin, key)
        _client(admin).get(f"{URL}{key}/export/")
    assert (Sale.objects.count(), Return.objects.count(), Refund.objects.count(), AuditEntry.objects.count()) == counts
