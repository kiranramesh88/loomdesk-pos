"""The report library. Every report returns the same shape (`Report`), so one workspace page and one CSV
writer serve them all.

Figures come only from saved records: sale and return snapshots for money, `Variant.on_hand` for stock,
`AuditEntry` for activity. Voided bills are left out of every sales figure. Refunds count on the day of
the return, sales on the day of the bill (see `definitions`).
"""

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Callable

from django.db.models import Count, F, Q, Sum
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.models import User

from apps.audit.models import AuditEntry
from apps.catalog.models import Category, Product, Variant
from apps.returns.models import Refund, Return, ReturnLine
from apps.sales.models import Payment, Sale, SaleLine

from . import definitions as d
from .period import Period

ROW_LIMIT = 5000


@dataclass
class Column:
    key: str
    label: str
    # money (integer paise), count, percent (basis points), text, date, datetime, reference (an invoice/return number)
    kind: str = "text"


@dataclass
class Filter:
    key: str
    label: str
    options: list[tuple[str, str]]


@dataclass
class Report:
    key: str
    title: str
    description: str
    uses_dates: bool
    build: Callable[["Report", Period | None, dict], dict]
    filters: Callable[[], list[Filter]] = lambda: []
    # Series drawn as a trend line (a date column and one value column), or None for no chart.
    trend: tuple[str, str] | None = None
    columns: list[Column] = field(default_factory=list)


def _sum(qs, name: str) -> int:
    return qs.aggregate(v=Coalesce(Sum(name), 0))["v"]


def _sales(period: Period):
    return Sale.objects.filter(status=Sale.Status.COMPLETED, created_at__date__range=(period.start, period.end)).order_by()


def _returns(period: Period):
    return Return.objects.filter(created_at__date__range=(period.start, period.end)).order_by()


def _metric(key: str, label: str, value: int, kind: str = "money") -> dict:
    return {"key": key, "label": label, "value": value, "kind": kind}


def _split(tax: int) -> tuple[int, int]:
    # As on receipts: CGST is the lower half, SGST takes the odd paisa.
    return tax // 2, tax - tax // 2


# ── Sales summary ───────────────────────────────────────────────────────────


def sales_figures(period: Period) -> dict:
    """The headline figures, shared by the sales summary and the Overview."""
    sales = _sales(period)
    totals = sales.aggregate(
        bills=Count("id"),
        gross=Coalesce(Sum("subtotal_paise"), 0),
        discounts=Coalesce(Sum("discount_paise"), 0),
        gst=Coalesce(Sum("tax_paise"), 0),
        sales=Coalesce(Sum("total_paise"), 0),
    )
    refunds = Refund.objects.filter(ret__in=_returns(period))
    voids = Sale.objects.filter(status=Sale.Status.VOIDED, created_at__date__range=(period.start, period.end))
    totals["refunds"] = _sum(refunds, "amount_paise")
    totals["returns"] = refunds.count()
    totals["net"] = totals["sales"] - totals["refunds"]
    totals["average"] = totals["sales"] // totals["bills"] if totals["bills"] else 0
    totals["voided_bills"] = voids.count()
    totals["voided_paise"] = _sum(voids, "total_paise")
    return totals


def build_sales_summary(report: Report, period: Period, params: dict) -> dict:
    f = sales_figures(period)
    by_day = {
        r["day"]: r
        for r in _sales(period).annotate(day=TruncDate("created_at")).values("day").annotate(bills=Count("id"), sales=Sum("total_paise"))
    }
    refunds = {
        r["day"]: r["refunds"]
        for r in Refund.objects.filter(ret__in=_returns(period))
        .annotate(day=TruncDate("ret__created_at"))
        .values("day")
        .annotate(refunds=Sum("amount_paise"))
    }
    rows = []
    for day in period.days():
        sales = by_day.get(day, {}).get("sales") or 0
        refund = refunds.get(day, 0)
        rows.append({"date": day, "bills": by_day.get(day, {}).get("bills", 0), "sales": sales, "refunds": refund, "net": sales - refund})
    return {
        "summary": [
            _metric("net", "Net sales", f["net"]),
            _metric("sales", "Sales", f["sales"]),
            _metric("refunds", "Refunds", f["refunds"]),
            _metric("bills", "Bills completed", f["bills"], "count"),
            _metric("average", "Average bill", f["average"]),
            _metric("gross", "Gross sales", f["gross"]),
            _metric("discounts", "Discounts", f["discounts"]),
            _metric("gst", "GST", f["gst"]),
            _metric("voided_bills", "Voided bills", f["voided_bills"], "count"),
            _metric("voided_paise", "Voided amount", f["voided_paise"]),
        ],
        "rows": rows,
        "definitions": d.as_list(d.SALES, d.REFUNDS, d.NET, d.AVERAGE, d.GROSS, d.DISCOUNTS, d.GST, d.VOIDS),
    }


# ── Sales by product ────────────────────────────────────────────────────────


def _category_filter() -> list[Filter]:
    return [Filter("category", "Category", [(str(c.id), c.name) for c in Category.objects.order_by("name")])]


def build_sales_by_product(report: Report, period: Period, params: dict) -> dict:
    lines = SaleLine.objects.filter(sale__in=_sales(period))
    returned = ReturnLine.objects.filter(ret__in=_returns(period))
    category = params.get("category")
    if category:
        # The line's variant still points at its product, so the product's category today decides the group.
        lines = lines.filter(variant__product__category_id=category)
        returned = returned.filter(sale_line__variant__product__category_id=category)
    rows: dict[str, dict] = {}

    def row(sku: str, name: str) -> dict:
        return rows.setdefault(sku, {"product": name, "sku": sku, "units": 0, "sales": 0, "units_returned": 0, "refunds": 0, "net": 0})

    for r in lines.values("product_sku", "product_name").annotate(units=Sum("quantity"), sales=Sum("total_paise")).order_by("product_sku", "product_name"):
        entry = row(r["product_sku"], r["product_name"])
        entry["units"] += r["units"]
        entry["sales"] += r["sales"]
    for r in (
        returned.values("sale_line__product_sku", "sale_line__product_name")
        .annotate(units=Sum("quantity"), refunds=Sum("total_paise"))
        .order_by("sale_line__product_sku")
    ):
        entry = row(r["sale_line__product_sku"], r["sale_line__product_name"])
        entry["units_returned"] += r["units"]
        entry["refunds"] += r["refunds"]
    result = sorted(rows.values(), key=lambda e: (-(e["sales"] - e["refunds"]), e["product"]))
    for e in result:
        e["net"] = e["sales"] - e["refunds"]
    return {
        "summary": [
            _metric("products", "Products sold", sum(1 for e in result if e["units"]), "count"),
            _metric("units", "Units sold", sum(e["units"] for e in result), "count"),
            _metric("sales", "Sales", sum(e["sales"] for e in result)),
            _metric("refunds", "Refunds", sum(e["refunds"] for e in result)),
            _metric("net", "Net sales", sum(e["net"] for e in result)),
        ],
        "rows": result,
        "definitions": d.as_list(
            ("Sales", "Line totals on completed bills: after the item’s share of any bill discount, GST included."),
            d.REFUNDS,
            d.NET,
            ("Product", "As printed on the bill. A product renamed later still groups under its SKU."),
        ),
    }


# ── Sales by staff ──────────────────────────────────────────────────────────


def build_sales_by_staff(report: Report, period: Period, params: dict) -> dict:
    sales = _sales(period)
    units = {r["sale__cashier_id"]: r["units"] for r in SaleLine.objects.filter(sale__in=sales).values("sale__cashier_id").annotate(units=Sum("quantity")).order_by()}
    voids = {
        r["cashier_id"]: r["n"]
        for r in Sale.objects.filter(status=Sale.Status.VOIDED, created_at__date__range=(period.start, period.end)).order_by().values("cashier_id").annotate(n=Count("id"))
    }
    rows = []
    for r in (
        sales.values("cashier_id", "cashier__full_name")
        .annotate(
            bills=Count("id"),
            sales=Sum("total_paise"),
            discounts=Sum("discount_paise"),
            approved=Count("id", filter=Q(discount_approved_by__isnull=False)),
        )
        .order_by("-sales", "cashier__full_name")
    ):
        rows.append(
            {
                "staff": r["cashier__full_name"],
                "bills": r["bills"],
                "units": units.get(r["cashier_id"], 0),
                "sales": r["sales"],
                "average": r["sales"] // r["bills"],
                "discounts": r["discounts"],
                "approved_discounts": r["approved"],
                "voided_bills": voids.pop(r["cashier_id"], 0),
            }
        )
    # Someone whose only bills in the dates were voided still shows up.
    names = dict(User.objects.filter(pk__in=voids).values_list("id", "full_name"))
    for cashier_id, n in voids.items():
        name = names.get(cashier_id, "")
        rows.append({"staff": name, "bills": 0, "units": 0, "sales": 0, "average": 0, "discounts": 0, "approved_discounts": 0, "voided_bills": n})
    return {
        "summary": [
            _metric("staff", "Staff with sales", sum(1 for r in rows if r["bills"]), "count"),
            _metric("bills", "Bills completed", sum(r["bills"] for r in rows), "count"),
            _metric("sales", "Sales", sum(r["sales"] for r in rows)),
            _metric("discounts", "Discounts", sum(r["discounts"] for r in rows)),
        ],
        "rows": rows,
        "definitions": d.as_list(
            ("Staff", "Whoever was signed in at the till for the bill, including accounts since deactivated."),
            d.SALES,
            d.AVERAGE,
            d.DISCOUNTS,
            ("Approved discounts", "Bills whose discount was over the cashier limit and needed a Senior cashier’s or Admin’s PIN."),
            d.VOIDS,
        ),
    }


# ── Payment methods ─────────────────────────────────────────────────────────


def method_figures(period: Period) -> list[dict]:
    sold = {r["payment__method"]: r for r in _sales(period).values("payment__method").annotate(bills=Count("id"), sales=Sum("total_paise"))}
    refunded = {r["method"]: r for r in Refund.objects.filter(ret__in=_returns(period)).values("method").annotate(n=Count("id"), refunds=Sum("amount_paise"))}
    rows = []
    for method, label in Payment.Method.choices:
        sales = sold.get(method, {}).get("sales") or 0
        refunds = refunded.get(method, {}).get("refunds") or 0
        rows.append(
            {
                "method": method,
                "method_label": label,
                "bills": sold.get(method, {}).get("bills", 0),
                "sales": sales,
                "refund_count": refunded.get(method, {}).get("n", 0),
                "refunds": refunds,
                "net": sales - refunds,
            }
        )
    return rows


def build_payment_methods(report: Report, period: Period, params: dict) -> dict:
    rows = method_figures(period)
    cash = next(r for r in rows if r["method"] == Payment.Method.CASH)
    return {
        "summary": [
            _metric("sales", "Recorded sales", sum(r["sales"] for r in rows)),
            _metric("refunds", "Recorded refunds", sum(r["refunds"] for r in rows)),
            _metric("net", "Net recorded", sum(r["net"] for r in rows)),
            _metric("cash_expected", "Cash expected", cash["net"]),
        ],
        "rows": [{k: v for k, v in r.items() if k != "method"} for r in rows],
        "definitions": d.as_list(d.RECORDED, d.CASH_IN_DRAWER, d.REFUNDS, d.VOIDS),
    }


# ── Returns and refunds ─────────────────────────────────────────────────────


def build_returns(report: Report, period: Period, params: dict) -> dict:
    reason = params.get("reason")
    returns = _returns(period).select_related("sale", "refund").order_by("-created_at", "-id")
    if reason:
        returns = returns.filter(reason=reason)
    units = defaultdict(lambda: defaultdict(int))
    for r in ReturnLine.objects.filter(ret__in=returns).values("ret_id", "disposition").annotate(n=Sum("quantity")):
        units[r["ret_id"]][r["disposition"]] = r["n"]
    rows = []
    for ret in returns[:ROW_LIMIT]:
        u = units[ret.id]
        rows.append(
            {
                "created_at": ret.created_at,
                "number": ret.number,
                "invoice_no": ret.sale.invoice_no,
                "reason": ret.get_reason_display(),
                "units": sum(u.values()),
                "restocked": u[ReturnLine.Disposition.SELLABLE],
                "damaged": u[ReturnLine.Disposition.DAMAGED],
                "held": u[ReturnLine.Disposition.INSPECTION],
                "refund_method": ret.refund.get_method_display(),
                "refund": ret.refund.amount_paise,
                "processed_by": ret.created_by_name,
            }
        )
    all_units = ReturnLine.objects.filter(ret__in=returns).values("disposition").annotate(n=Sum("quantity"))
    by_disposition = {r["disposition"]: r["n"] for r in all_units}
    return {
        "summary": [
            _metric("returns", "Returns", returns.count(), "count"),
            _metric("units", "Units returned", sum(by_disposition.values()), "count"),
            _metric("restocked", "Back to stock", by_disposition.get(ReturnLine.Disposition.SELLABLE, 0), "count"),
            _metric("refunds", "Refunds", _sum(Refund.objects.filter(ret__in=returns), "amount_paise")),
        ],
        "rows": rows,
        "truncated": returns.count() > ROW_LIMIT,
        "definitions": d.as_list(
            d.REFUNDS,
            ("Back to stock", "Units returned as sellable, added back to stock with a return movement."),
            ("Damaged and held", "Units kept out of stock. A held unit goes back only through a stock adjustment."),
            d.RECORDED,
        ),
    }


def _reason_filter() -> list[Filter]:
    return [Filter("reason", "Reason", list(Return.Reason.choices))]


# ── Voided bills ────────────────────────────────────────────────────────────


def build_voids(report: Report, period: Period, params: dict) -> dict:
    voids = Sale.objects.filter(status=Sale.Status.VOIDED, created_at__date__range=(period.start, period.end)).select_related("payment")
    rows = [
        {
            "created_at": s.created_at,
            "invoice_no": s.invoice_no,
            "cashier": s.cashier_name,
            "method": s.payment.get_method_display(),
            "total": s.total_paise,
            "voided_at": s.voided_at,
            "voided_by": s.voided_by_name,
            "reason": s.void_reason,
        }
        for s in voids.order_by("-created_at", "-id")[:ROW_LIMIT]
    ]
    return {
        "summary": [_metric("voided_bills", "Voided bills", voids.count(), "count"), _metric("voided_paise", "Voided amount", _sum(voids, "total_paise"))],
        "rows": rows,
        "truncated": voids.count() > ROW_LIMIT,
        "definitions": d.as_list(d.VOIDS, ("Amount", "The bill’s total as it was before the void. The receipt and lines are kept.")),
    }


# ── Tax summary ─────────────────────────────────────────────────────────────


def build_tax_summary(report: Report, period: Period, params: dict) -> dict:
    groups: dict[tuple[str, int], dict] = {}

    def row(hsn: str, rate: int) -> dict:
        return groups.setdefault(
            (hsn, rate), {"hsn_code": hsn or "—", "rate": rate, "taxable": 0, "gst": 0, "returned_taxable": 0, "returned_gst": 0}
        )

    for r in SaleLine.objects.filter(sale__in=_sales(period)).values("hsn_code", "tax_rate_bp").annotate(taxable=Sum("taxable_paise"), gst=Sum("tax_paise")).order_by():
        entry = row(r["hsn_code"], r["tax_rate_bp"])
        entry["taxable"] += r["taxable"]
        entry["gst"] += r["gst"]
    for r in (
        ReturnLine.objects.filter(ret__in=_returns(period))
        .values("sale_line__hsn_code", "sale_line__tax_rate_bp")
        .annotate(taxable=Sum("taxable_paise"), gst=Sum("tax_paise"))
        .order_by()
    ):
        entry = row(r["sale_line__hsn_code"], r["sale_line__tax_rate_bp"])
        entry["returned_taxable"] += r["taxable"]
        entry["returned_gst"] += r["gst"]
    rows = []
    for key in sorted(groups):
        g = groups[key]
        net_gst = g["gst"] - g["returned_gst"]
        cgst, sgst = _split(net_gst)
        rows.append({**g, "net_taxable": g["taxable"] - g["returned_taxable"], "cgst": cgst, "sgst": sgst, "net_gst": net_gst})
    return {
        "summary": [
            _metric("net_taxable", "Net taxable value", sum(r["net_taxable"] for r in rows)),
            _metric("cgst", "CGST", sum(r["cgst"] for r in rows)),
            _metric("sgst", "SGST", sum(r["sgst"] for r in rows)),
            _metric("net_gst", "Net GST", sum(r["net_gst"] for r in rows)),
        ],
        "rows": rows,
        "definitions": d.as_list(
            d.TAXABLE,
            ("Returned", "Taxable value and GST given back on returns in the dates, at the original bill’s rate."),
            d.CGST_SGST,
            d.NOT_A_RETURN,
        ),
    }


# ── Inventory valuation and low stock (snapshots, no dates) ─────────────────


def _stock(params: dict):
    variants = Variant.objects.filter(is_active=True, product__status=Product.Status.ACTIVE).select_related("product__category")
    category = params.get("category")
    if category:
        variants = variants.filter(product__category_id=category)
    return variants.order_by("product__name", "sku")


def build_valuation(report: Report, period: None, params: dict) -> dict:
    rows = []
    for v in _stock(params).filter(on_hand__gt=0):
        cost = v.product.cost_price_paise
        rows.append(
            {
                "product": v.product.name,
                "sku": v.sku,
                "option": f"{v.size} / {v.colour}",
                "category": v.product.category.name,
                "on_hand": v.on_hand,
                "cost_price": cost,
                "cost_value": cost * v.on_hand if cost is not None else None,
                "price": v.price_paise,
                "retail_value": v.price_paise * v.on_hand,
            }
        )
    return {
        "summary": [
            _metric("units", "Units on hand", sum(r["on_hand"] for r in rows), "count"),
            _metric("cost_value", "Stock at cost", sum(r["cost_value"] or 0 for r in rows)),
            _metric("retail_value", "Stock at retail", sum(r["retail_value"] for r in rows)),
            _metric("no_cost", "Variants without a cost price", sum(1 for r in rows if r["cost_value"] is None), "count"),
        ],
        "rows": rows,
        "definitions": d.as_list(d.COST_VALUE, d.RETAIL_VALUE, d.VALUATION_BASIS),
    }


def build_low_stock(report: Report, period: None, params: dict) -> dict:
    variants = _stock(params).filter(on_hand__lte=F("reorder_level"))
    state = params.get("state")
    if state == "low_stock":
        variants = variants.filter(on_hand__gt=0)
    elif state == "out_of_stock":
        variants = variants.filter(on_hand__lte=0)
    rows = [
        {
            "variant_id": v.id,
            "product": v.product.name,
            "sku": v.sku,
            "option": f"{v.size} / {v.colour}",
            "category": v.product.category.name,
            "on_hand": v.on_hand,
            "reorder_level": v.reorder_level,
            "state": "Out of stock" if v.on_hand <= 0 else "Low stock",
        }
        for v in variants.order_by("on_hand", "product__name", "sku")
    ]
    return {
        "summary": [
            _metric("low_stock", "Low stock", sum(1 for r in rows if r["on_hand"] > 0), "count"),
            _metric("out_of_stock", "Out of stock", sum(1 for r in rows if r["on_hand"] <= 0), "count"),
        ],
        "rows": rows,
        "definitions": d.as_list(d.LOW_STOCK, ("Included", "Active variants of active products only, as on the Inventory page.")),
    }


def _stock_filters() -> list[Filter]:
    return _category_filter() + [Filter("state", "Stock", [("low_stock", "Low stock"), ("out_of_stock", "Out of stock")])]


# ── Activity log ────────────────────────────────────────────────────────────


def build_activity(report: Report, period: Period, params: dict) -> dict:
    entries = AuditEntry.objects.filter(created_at__date__range=(period.start, period.end))
    action = params.get("action")
    if action:
        entries = entries.filter(action=action)
    labels = dict(AuditEntry.Action.choices)
    # Only the one-line summary is shown; `details` stays in the database and the Django admin.
    rows = [
        {"created_at": e.created_at, "action": labels.get(e.action, e.action), "actor": e.actor_name, "target": e.target, "summary": e.summary}
        for e in entries.order_by("-created_at", "-id")[:ROW_LIMIT]
    ]
    return {
        "summary": [_metric("entries", "Entries", entries.count(), "count")],
        "rows": rows,
        "truncated": entries.count() > ROW_LIMIT,
        "definitions": d.as_list(d.ACTIVITY),
    }


def _action_filter() -> list[Filter]:
    return [Filter("action", "Action", list(AuditEntry.Action.choices))]


C = Column
REPORTS: dict[str, Report] = {
    r.key: r
    for r in [
        Report(
            "sales-summary",
            "Sales summary",
            "Sales, refunds and net sales by day, with gross, discounts, GST and voids.",
            True,
            build_sales_summary,
            trend=("date", "net"),
            columns=[C("date", "Date", "date"), C("bills", "Bills", "count"), C("sales", "Sales", "money"), C("refunds", "Refunds", "money"), C("net", "Net sales", "money")],
        ),
        Report(
            "sales-by-product",
            "Sales by product",
            "Units and sales for each product, less what came back.",
            True,
            build_sales_by_product,
            filters=_category_filter,
            columns=[
                C("product", "Product"),
                C("sku", "SKU"),
                C("units", "Units sold", "count"),
                C("sales", "Sales", "money"),
                C("units_returned", "Units returned", "count"),
                C("refunds", "Refunds", "money"),
                C("net", "Net sales", "money"),
            ],
        ),
        Report(
            "sales-by-staff",
            "Sales by staff",
            "Bills, sales and discounts for each person at the till.",
            True,
            build_sales_by_staff,
            columns=[
                C("staff", "Staff"),
                C("bills", "Bills", "count"),
                C("units", "Units", "count"),
                C("sales", "Sales", "money"),
                C("average", "Average bill", "money"),
                C("discounts", "Discounts", "money"),
                C("approved_discounts", "Approved discounts", "count"),
                C("voided_bills", "Voided bills", "count"),
            ],
        ),
        Report(
            "payment-methods",
            "Payment methods",
            "Recorded sales and refunds by cash, UPI and card, and the cash expected in the drawer.",
            True,
            build_payment_methods,
            columns=[
                C("method_label", "Method"),
                C("bills", "Bills", "count"),
                C("sales", "Sales", "money"),
                C("refund_count", "Refunds", "count"),
                C("refunds", "Refunded", "money"),
                C("net", "Net recorded", "money"),
            ],
        ),
        Report(
            "returns",
            "Returns & refunds",
            "Every return in the dates: what came back, where it went and the refund.",
            True,
            build_returns,
            filters=_reason_filter,
            columns=[
                C("created_at", "Returned", "datetime"),
                C("number", "Return", "reference"),
                C("invoice_no", "Bill", "reference"),
                C("reason", "Reason"),
                C("units", "Units", "count"),
                C("restocked", "Back to stock", "count"),
                C("damaged", "Damaged", "count"),
                C("held", "Held", "count"),
                C("refund_method", "Refunded by"),
                C("refund", "Refund", "money"),
                C("processed_by", "Processed by"),
            ],
        ),
        Report(
            "voids",
            "Voided bills",
            "Bills cancelled on the day, with who voided them and why.",
            True,
            build_voids,
            columns=[
                C("created_at", "Billed", "datetime"),
                C("invoice_no", "Bill", "reference"),
                C("cashier", "Cashier"),
                C("method", "Paid by"),
                C("total", "Amount", "money"),
                C("voided_at", "Voided", "datetime"),
                C("voided_by", "Voided by"),
                C("reason", "Reason"),
            ],
        ),
        Report(
            "tax-summary",
            "Tax summary",
            "Taxable value and GST by HSN code and rate, less returns, split into CGST and SGST.",
            True,
            build_tax_summary,
            columns=[
                C("hsn_code", "HSN"),
                C("rate", "Rate", "percent"),
                C("taxable", "Taxable value", "money"),
                C("gst", "GST", "money"),
                C("returned_taxable", "Returned taxable", "money"),
                C("returned_gst", "Returned GST", "money"),
                C("net_taxable", "Net taxable", "money"),
                C("cgst", "CGST", "money"),
                C("sgst", "SGST", "money"),
                C("net_gst", "Net GST", "money"),
            ],
        ),
        Report(
            "inventory-valuation",
            "Inventory valuation",
            "Stock on hand at cost and at retail, at today’s prices.",
            False,
            build_valuation,
            filters=_category_filter,
            columns=[
                C("product", "Product"),
                C("sku", "Variant SKU"),
                C("option", "Size / colour"),
                C("category", "Category"),
                C("on_hand", "On hand", "count"),
                C("cost_price", "Cost price", "money"),
                C("cost_value", "At cost", "money"),
                C("price", "Price", "money"),
                C("retail_value", "At retail", "money"),
            ],
        ),
        Report(
            "low-stock",
            "Low stock",
            "Variants at or below their reorder level, emptiest first.",
            False,
            build_low_stock,
            filters=_stock_filters,
            columns=[
                C("product", "Product"),
                C("sku", "Variant SKU"),
                C("option", "Size / colour"),
                C("category", "Category"),
                C("on_hand", "On hand", "count"),
                C("reorder_level", "Reorder level", "count"),
                C("state", "Stock"),
            ],
        ),
        Report(
            "activity",
            "Activity log",
            "Voids, returns, staff, PIN and settings changes, newest first.",
            True,
            build_activity,
            filters=_action_filter,
            columns=[C("created_at", "Time", "datetime"), C("action", "Action"), C("actor", "By"), C("target", "On"), C("summary", "What happened")],
        ),
    ]
}


def run(report: Report, period: Period | None, params: dict) -> dict:
    filters = report.filters()
    applied = {f.key: params[f.key] for f in filters if params.get(f.key)}
    for f in filters:
        # Checked here, so each builder can trust its filter values.
        if f.key in applied and applied[f.key] not in {value for value, _ in f.options}:
            raise ValidationError({f.key: ["Choose one of the listed options."]})
    body = report.build(report, period, applied)
    return {
        "key": report.key,
        "title": report.title,
        "description": report.description,
        "uses_dates": report.uses_dates,
        "period": period.as_dict() if period else None,
        "generated_at": timezone.now(),
        "filters": [{"key": f.key, "label": f.label, "options": [{"value": v, "label": l} for v, l in f.options]} for f in filters],
        "applied": applied,
        "columns": [{"key": c.key, "label": c.label, "kind": c.kind} for c in report.columns],
        "trend": {"x": report.trend[0], "y": report.trend[1]} if report.trend else None,
        "truncated": False,
        **body,
    }
