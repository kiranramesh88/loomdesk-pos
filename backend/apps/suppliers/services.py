"""Supplier purchases and payments.

Money is integer paise and rates are basis points, as everywhere else. A purchase line's GST is
`round_half_up(quantity × unit cost × rate / 10000)`; the purchase totals are the sums of its lines.
Only receive_purchase() changes stock, and only through record_movement().
"""

import hashlib
import json
from dataclasses import dataclass
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.db.models import Q, Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException, ValidationError

from apps.catalog.models import Product, Variant
from apps.inventory.models import StockMovement
from apps.inventory.services import record_movement
from apps.sales.pricing import round_paise

from .models import Purchase, PurchaseLine, Supplier, SupplierPayment

PURCHASE_SERIES = "PUR"
BP = Decimal(10_000)
# GST rates that appear on supplier invoices (12% and 28% predate the Sep 2025 rationalisation).
GST_RATES_BP = (0, 500, 1200, 1800, 2800, 4000)


class Conflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "conflict"


class AlreadyReceived(Conflict):
    default_code = "already_received"


class PurchaseClosed(Conflict):
    default_code = "purchase_closed"


class IdempotencyMismatch(Conflict):
    default_code = "idempotency_key_reused"


@dataclass
class PricedLine:
    variant: Variant
    quantity: int
    unit_cost_paise: int
    tax_rate_bp: int
    subtotal_paise: int
    tax_paise: int
    total_paise: int


@dataclass
class PricedPurchase:
    lines: list[PricedLine]
    subtotal_paise: int
    tax_paise: int
    total_paise: int


def price_lines(lines: list[dict]) -> PricedPurchase:
    """Price submitted lines. A line without a rate takes its product's GST rule at the unit cost."""
    variants = Variant.objects.select_related("product__category__tax_rule", "product__tax_rule").in_bulk(
        [line["variant"].pk for line in lines]
    )
    priced = []
    for line in lines:
        variant = variants[line["variant"].pk]
        quantity, unit_cost = line["quantity"], line["unit_cost_paise"]
        rate = line.get("tax_rate_bp")
        if rate is None:
            rate = variant.product.effective_tax_rule.rate_bp_for(unit_cost)
        subtotal = quantity * unit_cost
        tax = round_paise(Decimal(subtotal) * rate / BP)
        priced.append(PricedLine(variant, quantity, unit_cost, rate, subtotal, tax, subtotal + tax))
    return PricedPurchase(
        lines=priced,
        subtotal_paise=sum(line.subtotal_paise for line in priced),
        tax_paise=sum(line.tax_paise for line in priced),
        total_paise=sum(line.total_paise for line in priced),
    )


def _check_orderable(supplier: Supplier, lines: list[dict]) -> None:
    if supplier.status != Supplier.Status.ACTIVE:
        raise ValidationError({"supplier": ["This supplier is inactive. Reactivate it to record purchases."]})
    for index, line in enumerate(lines):
        variant = line["variant"]
        if not variant.is_active or variant.product.status != Product.Status.ACTIVE:
            raise ValidationError({f"lines.{index}.variant": [f"{variant.sku} is inactive, so it can’t be bought in."]})


def _fingerprint(supplier: Supplier, data: dict) -> str:
    payload = {"supplier": supplier.pk, **data}
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()


def _write_lines(purchase: Purchase, priced: PricedPurchase) -> None:
    PurchaseLine.objects.bulk_create(
        PurchaseLine(
            purchase=purchase,
            variant=line.variant,
            product_name=line.variant.product.name,
            variant_sku=line.variant.sku,
            size=line.variant.size,
            colour=line.variant.colour,
            quantity=line.quantity,
            unit_cost_paise=line.unit_cost_paise,
            tax_rate_bp=line.tax_rate_bp,
            subtotal_paise=line.subtotal_paise,
            tax_paise=line.tax_paise,
            total_paise=line.total_paise,
        )
        for line in priced.lines
    )


def _invoice_taken(error: IntegrityError) -> bool:
    return "unique_supplier_invoice" in str(error) or "supplier_invoice_no" in str(error)


INVOICE_TAKEN = {"supplier_invoice_no": ["This supplier invoice is already recorded."]}


def _replay(model, user_field: str, user, key, fingerprint: str, label):
    existing = model.objects.filter(**{user_field: user, "idempotency_key": key}).first()
    if existing is not None and existing.request_hash != fingerprint:
        raise IdempotencyMismatch(f"This form was already saved as {label(existing)} with different details. Open it instead.")
    return existing


def create_purchase(user, supplier: Supplier, data: dict, key) -> tuple[Purchase, bool]:
    """Record a purchase (no stock change). Returns (purchase, created); a retry with the same key returns the first."""
    fingerprint = _fingerprint(supplier, _plain(data))
    label = lambda p: p.number  # noqa: E731
    if existing := _replay(Purchase, "created_by", user, key, fingerprint, label):
        return existing, False
    _check_orderable(supplier, data["lines"])
    try:
        with transaction.atomic():
            priced = price_lines(data["lines"])
            purchase = Purchase.objects.create(
                supplier=supplier,
                supplier_invoice_no=data.get("supplier_invoice_no", ""),
                purchase_date=data["purchase_date"],
                notes=data.get("notes", ""),
                subtotal_paise=priced.subtotal_paise,
                tax_paise=priced.tax_paise,
                total_paise=priced.total_paise,
                created_by=user,
                idempotency_key=key,
                request_hash=fingerprint,
            )
            purchase.number = f"{PURCHASE_SERIES}-{purchase.pk:06d}"
            purchase.save(update_fields=["number"])
            _write_lines(purchase, priced)
            return purchase, True
    except IntegrityError as error:
        if existing := _replay(Purchase, "created_by", user, key, fingerprint, label):
            return existing, False
        if _invoice_taken(error):
            raise ValidationError(INVOICE_TAKEN) from None
        raise


@transaction.atomic
def update_purchase(purchase: Purchase, data: dict) -> Purchase:
    """Replace the header and lines of a purchase that is still awaiting goods."""
    locked = Purchase.objects.select_for_update().get(pk=purchase.pk)
    if locked.status != Purchase.Status.ORDERED:
        raise PurchaseClosed(f"{locked.number} is {locked.get_status_display().lower()} and can no longer be edited.")
    _check_orderable(locked.supplier, data["lines"])
    priced = price_lines(data["lines"])
    locked.supplier_invoice_no = data.get("supplier_invoice_no", "")
    locked.purchase_date = data["purchase_date"]
    locked.notes = data.get("notes", "")
    locked.subtotal_paise, locked.tax_paise, locked.total_paise = priced.subtotal_paise, priced.tax_paise, priced.total_paise
    try:
        with transaction.atomic():
            locked.save()
    except IntegrityError as error:
        if _invoice_taken(error):
            raise ValidationError(INVOICE_TAKEN) from None
        raise
    locked.lines.all().delete()
    _write_lines(locked, priced)
    return locked


@transaction.atomic
def receive_purchase(purchase: Purchase, user) -> Purchase:
    """Add every line to stock, once. The purchase row is locked first, so a second submission
    waits, then finds it received and adds nothing."""
    locked = Purchase.objects.select_for_update().select_related("supplier").get(pk=purchase.pk)
    if locked.status == Purchase.Status.RECEIVED:
        raise AlreadyReceived(f"{locked.number} was already received; stock was not added again.")
    if locked.status == Purchase.Status.CANCELLED:
        raise PurchaseClosed(f"{locked.number} is cancelled, so it can’t be received.")
    if not locked.supplier_invoice_no:
        raise ValidationError({"supplier_invoice_no": ["Add the supplier’s invoice number before receiving the goods."]})
    reason = f"Received from {locked.supplier.name}, invoice {locked.supplier_invoice_no}"[:200]
    # Variants in id order, so concurrent receipts and sales lock rows in the same order.
    for line in locked.lines.select_related("variant").order_by("variant_id"):
        record_movement(
            variant=line.variant,
            type=StockMovement.Type.PURCHASE,
            quantity_delta=line.quantity,
            actor=user,
            reason=reason,
            reference=locked.number,
        )
    locked.status = Purchase.Status.RECEIVED
    locked.received_at = timezone.now()
    locked.received_by = user
    locked.save(update_fields=["status", "received_at", "received_by", "updated_at"])
    return locked


@transaction.atomic
def cancel_purchase(purchase: Purchase, user, reason: str) -> Purchase:
    locked = Purchase.objects.select_for_update().get(pk=purchase.pk)
    if locked.status != Purchase.Status.ORDERED:
        raise PurchaseClosed(f"{locked.number} is {locked.get_status_display().lower()} and can’t be cancelled.")
    locked.status = Purchase.Status.CANCELLED
    locked.cancelled_at = timezone.now()
    locked.cancelled_by = user
    locked.cancel_reason = reason
    locked.save(update_fields=["status", "cancelled_at", "cancelled_by", "cancel_reason", "updated_at"])
    return locked


def record_payment(user, supplier: Supplier, data: dict, key) -> tuple[SupplierPayment, bool]:
    """Record a payment entered by staff. Returns (payment, created); a retry with the same key returns the first."""
    fingerprint = _fingerprint(supplier, _plain(data))
    label = lambda p: f"a {p.get_method_display()} payment of ₹{p.amount_paise / 100:,.2f}"  # noqa: E731
    if existing := _replay(SupplierPayment, "recorded_by", user, key, fingerprint, label):
        return existing, False
    try:
        with transaction.atomic():
            payment = SupplierPayment.objects.create(
                supplier=supplier, recorded_by=user, idempotency_key=key, request_hash=fingerprint, **data
            )
            return payment, True
    except IntegrityError:
        if existing := _replay(SupplierPayment, "recorded_by", user, key, fingerprint, label):
            return existing, False
        raise


def _plain(data: dict) -> dict:
    """Validated data as JSON-safe values (model instances become their ids)."""
    def value(v):
        if isinstance(v, list):
            return [value(item) for item in v]
        if isinstance(v, dict):
            return {k: value(item) for k, item in v.items()}
        return getattr(v, "pk", v)

    return value(data)


# --- Balances ---

RECEIVED = Q(status=Purchase.Status.RECEIVED)


def supplier_totals(supplier: Supplier) -> dict:
    """Recorded figures for one supplier. Only received purchases count towards what is owed."""
    purchases = supplier.purchases.aggregate(
        received=Sum("total_paise", filter=RECEIVED),
        awaiting=Sum("total_paise", filter=Q(status=Purchase.Status.ORDERED)),
    )
    paid = supplier.payments.aggregate(total=Sum("amount_paise"))["total"] or 0
    received = purchases["received"] or 0
    return {
        "received_paise": received,
        "awaiting_paise": purchases["awaiting"] or 0,
        "paid_paise": paid,
        "balance_paise": received - paid,
    }


def statement(supplier: Supplier) -> list[dict]:
    """Received purchases (amounts owed) and payments, oldest first, with a running balance."""
    entries = [
        {
            "date": p.purchase_date,
            "recorded_at": p.received_at,
            "kind": "purchase",
            "reference": p.number,
            "detail": f"Invoice {p.supplier_invoice_no}",
            "debit_paise": p.total_paise,
            "credit_paise": 0,
        }
        for p in supplier.purchases.filter(RECEIVED)
    ] + [
        {
            "date": pay.paid_on,
            "recorded_at": pay.created_at,
            "kind": "payment",
            "reference": pay.reference,
            "detail": f"{pay.get_method_display()} payment, recorded by staff",
            "debit_paise": 0,
            "credit_paise": pay.amount_paise,
        }
        for pay in supplier.payments.all()
    ]
    entries.sort(key=lambda e: (e["date"], e["recorded_at"]))
    balance = 0
    for entry in entries:
        balance += entry["debit_paise"] - entry["credit_paise"]
        entry["balance_paise"] = balance
    return entries
