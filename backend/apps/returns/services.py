"""Customer returns. The client sends what comes back (sale lines, quantities, where each goes) and how the
money goes back; every refund figure is worked out here from the sale's saved lines.

Safety rules (CLAUDE.md, returns):
- the sale row is locked first, so two returns of the same bill, or a return racing a void, run one at a
  time and each sees what the other wrote;
- at most `sold − already returned` units of a line can come back;
- only the `sellable` disposition puts units back on the shelf, through `record_movement`;
- the sale, its lines and its payment are never changed;
- an `Idempotency-Key` makes a retried request return the first result instead of refunding twice.
"""

import hashlib
import json
from dataclasses import dataclass
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.db.models import Sum
from rest_framework.exceptions import NotFound, ValidationError

from apps.accounts.models import User
from apps.audit import services as audit
from apps.audit.models import AuditEntry
from apps.inventory.models import StockMovement
from apps.inventory.services import record_movement
from apps.sales.models import InvoiceCounter, Payment, Sale, SaleLine
from apps.sales.pricing import round_paise
from apps.sales.services import Conflict, IdempotencyMismatch

from .models import Refund, Return, ReturnLine

RETURN_SERIES = "RET"


class SaleVoided(Conflict):
    default_code = "sale_voided"


class RefundChanged(Conflict):
    default_code = "refund_changed"


@dataclass(frozen=True)
class RefundFigures:
    subtotal_paise: int
    discount_paise: int
    taxable_paise: int
    tax_paise: int
    total_paise: int


def _share(value: int, done: int, now: int, sold: int) -> int:
    """Units `done+1 … done+now` of `sold` get this many paise of `value`.

    Cumulative rounding: the share of the first n units is round(value × n / sold), and each return takes
    the difference. However a line is returned, one unit at a time or all at once, the shares add up to
    exactly `value`, so a fully returned line refunds exactly what was paid for it.
    """
    return round_paise(Decimal(value) * (done + now) / sold) - round_paise(Decimal(value) * done / sold)


def refund_for(line: SaleLine, already_returned: int, quantity: int, prices_include_tax: bool) -> RefundFigures:
    """What `quantity` more units of a sold line are worth, from the values saved on the line.

    The line's value after its share of the bill discount and its tax are shared out per unit; the slab
    and rate are the ones charged, whatever today's rules say.
    """
    after_discount = _share(line.subtotal_paise - line.discount_paise, already_returned, quantity, line.quantity)
    tax = _share(line.tax_paise, already_returned, quantity, line.quantity)
    subtotal = line.unit_price_paise * quantity
    if prices_include_tax:  # the price already held the tax
        taxable, total = after_discount - tax, after_discount
    else:
        taxable, total = after_discount, after_discount + tax
    return RefundFigures(subtotal, subtotal - after_discount, taxable, tax, total)


def _units(count: int) -> str:
    return f"{count} unit" if count == 1 else f"{count} units"


def returned_by_line(sale: Sale) -> dict[int, int]:
    rows = ReturnLine.objects.filter(sale_line__sale=sale).values("sale_line").annotate(units=Sum("quantity"))
    return {row["sale_line"]: row["units"] for row in rows}


def allowed_refund_methods(sale: Sale) -> list[str]:
    """The method the customer paid with, or cash (decision D3)."""
    paid = sale.payment.method
    return [paid] if paid == Payment.Method.CASH else [paid, Payment.Method.CASH]


@dataclass(frozen=True)
class PlannedLine:
    sale_line: SaleLine
    quantity: int
    disposition: str
    figures: RefundFigures


def get_sale(invoice_no: str, *, lock: bool) -> Sale:
    sales = Sale.objects.select_related("payment")
    if lock:
        sales = sales.select_for_update(of=("self",))
    sale = sales.filter(invoice_no=invoice_no).first()
    if sale is None:
        raise NotFound("No sale has that invoice number.")
    return sale


def plan_return(sale: Sale, data: dict) -> list[PlannedLine]:
    """Check the request against the sale as it is now. Errors point at `lines.N.<field>`."""
    if sale.status == Sale.Status.VOIDED:
        raise SaleVoided(f"{sale.invoice_no} was voided, so nothing on it can be returned.")
    if data["refund"]["method"] not in allowed_refund_methods(sale):
        message = (
            "This bill was paid in cash, so refund it in cash."
            if sale.payment.method == Payment.Method.CASH
            else f"Refund this bill by {sale.payment.get_method_display()} or in cash."
        )
        raise ValidationError({"refund.method": [message]})
    sale_lines = {line.pk: line for line in sale.lines.all()}
    returned = returned_by_line(sale)
    errors: list[dict] = [{} for _ in data["lines"]]
    seen: set[int] = set()
    planned = []
    for i, item in enumerate(data["lines"]):
        line = sale_lines.get(item["sale_line"])
        if line is None:
            errors[i]["sale_line"] = ["This item isn’t on that bill."]
        elif line.pk in seen:
            errors[i]["sale_line"] = ["This item is listed twice. Combine the quantities."]
        else:
            done = returned.get(line.pk, 0)
            eligible = line.quantity - done
            if item["quantity"] > eligible:
                errors[i]["quantity"] = [
                    f"Only {eligible} can still be returned." if eligible else "Every unit of this item was already returned."
                ]
            else:
                figures = refund_for(line, done, item["quantity"], sale.prices_include_tax)
                planned.append(PlannedLine(line, item["quantity"], item["disposition"], figures))
            seen.add(line.pk)
    if any(errors):
        raise ValidationError({"lines": errors})
    return planned


def totals(planned: list[PlannedLine]) -> RefundFigures:
    return RefundFigures(
        *(sum(getattr(p.figures, field) for p in planned) for field in RefundFigures.__dataclass_fields__)
    )


def quote_return(data: dict) -> tuple[Sale, list[PlannedLine], RefundFigures]:
    sale = get_sale(data["invoice_no"], lock=False)
    planned = plan_return(sale, data)
    return sale, planned, totals(planned)


def _fingerprint(data: dict) -> str:
    payload = {key: data.get(key) for key in ("invoice_no", "reason", "note", "lines", "refund", "expected_total_paise")}
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()


def _replay(user: User, key, fingerprint: str) -> Return | None:
    existing = Return.objects.filter(created_by=user, idempotency_key=key).first()
    if existing is not None and existing.request_hash != fingerprint:
        raise IdempotencyMismatch(
            f"This return was already recorded as {existing.number} with different details. Open it instead of refunding again."
        )
    return existing


def create_return(user: User, data: dict, key) -> tuple[Return, bool]:
    """Write the return, its lines, the refund and any restocking in one transaction.

    Returns (return, created). A retry with the same key returns the first result.
    """
    fingerprint = _fingerprint(data)
    if existing := _replay(user, key, fingerprint):
        return existing, False
    try:
        with transaction.atomic():
            return _write_return(user, data, key, fingerprint), True
    except IntegrityError:
        if existing := _replay(user, key, fingerprint):
            return existing, False
        raise


def _write_return(user: User, data: dict, key, fingerprint: str) -> Return:
    sale = get_sale(data["invoice_no"], lock=True)
    planned = plan_return(sale, data)
    total = totals(planned)
    if total.total_paise != data["expected_total_paise"]:
        raise RefundChanged(
            f"The refund is now ₹{total.total_paise / 100:,.2f}, not the ₹{data['expected_total_paise'] / 100:,.2f} "
            "shown. Review the return again."
        )

    counter, _ = InvoiceCounter.objects.select_for_update().get_or_create(series=RETURN_SERIES)
    counter.last_number += 1
    counter.save(update_fields=["last_number"])

    ret = Return.objects.create(
        number=f"{RETURN_SERIES}-{counter.last_number:06d}",
        sale=sale,
        reason=data["reason"],
        note=data.get("note", ""),
        created_by=user,
        created_by_name=user.full_name,
        idempotency_key=key,
        request_hash=fingerprint,
        subtotal_paise=total.subtotal_paise,
        discount_paise=total.discount_paise,
        taxable_paise=total.taxable_paise,
        tax_paise=total.tax_paise,
        total_paise=total.total_paise,
    )
    ReturnLine.objects.bulk_create(
        ReturnLine(
            ret=ret,
            sale_line=p.sale_line,
            quantity=p.quantity,
            disposition=p.disposition,
            subtotal_paise=p.figures.subtotal_paise,
            discount_paise=p.figures.discount_paise,
            taxable_paise=p.figures.taxable_paise,
            tax_paise=p.figures.tax_paise,
            total_paise=p.figures.total_paise,
        )
        for p in planned
    )
    refund = data["refund"]
    Refund.objects.create(
        ret=ret,
        method=refund["method"],
        amount_paise=total.total_paise,
        reference=refund.get("reference", ""),
        recorded_by=user,
    )
    # Variant rows lock in id order, like checkout's, so concurrent stock changes can't deadlock.
    for p in sorted(planned, key=lambda p: p.sale_line.variant_id):
        if p.disposition == ReturnLine.Disposition.SELLABLE:
            record_movement(
                variant=p.sale_line.variant,
                type=StockMovement.Type.RETURN,
                quantity_delta=p.quantity,
                actor=user,
                reference=ret.number,
                reason=f"Returned from {sale.invoice_no}",
            )
    audit.record(
        user,
        AuditEntry.Action.RETURN_CREATE,
        ret.number,
        f"{ret.number} for {sale.invoice_no}: {_units(sum(p.quantity for p in planned))}, "
        f"refund ₹{total.total_paise / 100:,.2f} by {Payment.Method(refund['method']).label}",
        invoice_no=sale.invoice_no,
        refund_paise=total.total_paise,
        method=refund["method"],
        restocked_units=sum(p.quantity for p in planned if p.disposition == ReturnLine.Disposition.SELLABLE),
    )
    return ret
