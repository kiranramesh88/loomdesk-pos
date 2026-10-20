"""Quote and checkout. The client sends only what the cashier chose (variants, quantities, a
discount and the payment); every price, tax figure and total is worked out here from the database."""

import hashlib
import json
from decimal import Decimal

from datetime import timedelta

from django.db import IntegrityError, transaction
from rest_framework import status
from rest_framework.exceptions import APIException, ValidationError

from apps.accounts import attempts
from apps.accounts.models import Role, User
from apps.catalog.models import Product, Variant
from apps.inventory.models import StockMovement
from apps.inventory.services import StockError, record_movement
from apps.store.models import StoreSettings

from .models import InvoiceCounter, Payment, Sale, SaleLine
from .pricing import BP, PricedBill, price_bill, round_paise

INVOICE_SERIES = "LD"
PIN_ATTEMPTS = 5
PIN_LOCK_WINDOW = timedelta(minutes=15)


class Conflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "conflict"


class TotalChanged(Conflict):
    default_code = "total_changed"


class IdempotencyMismatch(Conflict):
    default_code = "idempotency_key_reused"


def _variants(ids: list[int], *, lock: bool) -> dict[int, Variant]:
    queryset = Variant.objects.select_related("product__category__tax_rule", "product__tax_rule").filter(pk__in=ids)
    if lock:
        # Locked in id order so two tills selling overlapping items can't deadlock. `of=self`
        # keeps Postgres from refusing to lock the nullable side of the tax-rule join.
        queryset = queryset.select_for_update(of=("self",)).order_by("pk")
    return {variant.pk: variant for variant in queryset}


def resolve_items(lines: list[dict], *, lock: bool) -> list[tuple[Variant, int]]:
    """Check every line is a sellable variant with enough stock. Errors point at `lines.N.<field>`."""
    found = _variants([line["variant"] for line in lines], lock=lock)
    errors: list[dict] = [{} for _ in lines]
    seen: set[int] = set()
    items = []
    for i, line in enumerate(lines):
        variant = found.get(line["variant"])
        if line["variant"] in seen:
            errors[i]["variant"] = ["This variant is already on the bill. Change its quantity instead."]
        elif variant is None:
            errors[i]["variant"] = ["This item no longer exists. Remove it from the bill."]
        elif not variant.is_active or variant.product.status != Product.Status.ACTIVE:
            errors[i]["variant"] = ["This item is no longer sold. Remove it from the bill."]
        elif variant.on_hand < line["quantity"]:
            errors[i]["quantity"] = [
                f"Only {variant.on_hand} left in stock." if variant.on_hand > 0 else "Out of stock. Remove it from the bill."
            ]
        else:
            items.append((variant, line["quantity"]))
        seen.add(line["variant"])
    if any(errors):
        raise ValidationError({"lines": errors})
    return items


def discount_paise(discount: dict | None, subtotal: int) -> int:
    if not discount or not discount["value"]:
        return 0
    if discount["kind"] == "percent":
        amount = round_paise(Decimal(subtotal) * discount["value"] / BP)
    else:
        amount = discount["value"]
    if amount > subtotal:
        raise ValidationError({"discount": ["The discount can’t be more than the bill subtotal."]})
    return amount


def cashier_limit_paise(user: User, subtotal: int, store: StoreSettings) -> int | None:
    """Most a user may discount without approval; None means no limit (Senior cashier, Admin)."""
    if user.can_approve_discounts:
        return None
    # Rounded like a percentage discount, so a cashier's "10%" never lands a paisa over a 10% limit.
    return round_paise(Decimal(subtotal) * store.cashier_discount_limit_pct / 100)


def _pin_key(approver_id: int) -> str:
    return f"approval-pin:{approver_id}"


def _above_limit(amount: int, limit: int | None) -> bool:
    return bool(amount) and limit is not None and amount > limit


def authorise_discount(user: User, amount: int, limit: int | None, approver_id, pin) -> User | None:
    """Who stands behind the discount. Above a cashier's limit that's a Senior cashier or Admin
    who entered their PIN.

    PIN attempts are counted per approver under a row lock (`apps.accounts.attempts`): five in a
    15-minute window, however many arrive at once, then the PIN is locked until 15 minutes after the
    last one. The count commits on its own, so call this outside the sale's transaction.
    """
    if not amount:
        return None
    if limit is None:
        return user  # Senior cashiers and Admins apply discounts on their own authority.
    if not _above_limit(amount, limit):
        return None
    if not approver_id or not pin:
        raise ValidationError(
            {"approval_pin": ["This discount is above your limit. A Senior cashier or Admin must approve it."]}
        )
    approver = User.objects.filter(
        pk=approver_id, is_active=True, role__in=[Role.SENIOR_CASHIER, Role.ADMIN]
    ).first()
    if approver is None:
        raise ValidationError({"approver_id": ["Choose a Senior cashier or Admin to approve the discount."]})
    reservation = attempts.reserve(_pin_key(approver.pk), PIN_ATTEMPTS, PIN_LOCK_WINDOW)
    if not reservation.allowed:
        raise ValidationError(
            {
                "approval_pin": [
                    f"Too many wrong PINs. {approver.full_name} can approve again in "
                    f"{reservation.retry_minutes} minute{'s' if reservation.retry_minutes != 1 else ''}."
                ]
            }
        )
    if not approver.check_approval_pin(pin):
        raise ValidationError({"approval_pin": ["That PIN isn’t right."]})
    attempts.clear(_pin_key(approver.pk))
    return approver


def _approve_checkout_discount(user: User, data: dict) -> User | None:
    """Check the discount's approval before the sale's transaction opens, so a wrong PIN stays counted
    even though the refused checkout writes nothing. `_write_sale` re-checks the figures under lock."""
    if not data.get("discount"):
        return None
    store = StoreSettings.load()
    items = resolve_items(data["lines"], lock=False)
    subtotal = sum(variant.price_paise * quantity for variant, quantity in items)
    amount = discount_paise(data.get("discount"), subtotal)
    return authorise_discount(
        user, amount, cashier_limit_paise(user, subtotal, store), data.get("approver_id"), data.get("approval_pin")
    )


def quote(user: User, data: dict) -> tuple[PricedBill, int | None]:
    store = StoreSettings.load()
    items = resolve_items(data["lines"], lock=False)
    subtotal = sum(variant.price_paise * quantity for variant, quantity in items)
    amount = discount_paise(data.get("discount"), subtotal)
    return price_bill(items, amount, store.prices_include_tax), cashier_limit_paise(user, subtotal, store)


def _fingerprint(data: dict) -> str:
    """Hash of the bill as submitted (not the PIN), to spot a key reused for a different bill."""
    payload = {key: data.get(key) for key in ("lines", "discount", "payment", "expected_total_paise", "approver_id")}
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()


def _replay(user: User, key, fingerprint: str) -> Sale | None:
    sale = Sale.objects.filter(cashier=user, idempotency_key=key).first()
    if sale is not None and sale.request_hash != fingerprint:
        # The first attempt was saved even though its response never arrived; say which sale it was.
        raise IdempotencyMismatch(
            f"This bill was already completed as {sale.invoice_no} with different payment details. "
            "Open that receipt instead of charging again."
        )
    return sale


def checkout(user: User, data: dict, key) -> tuple[Sale, bool]:
    """Write the sale, its lines, the payment and the stock movements in one transaction.

    Returns (sale, created). A retry with the same idempotency key returns the original sale,
    including when two identical requests race: the unique constraint lets only one commit.
    """
    fingerprint = _fingerprint(data)
    if existing := _replay(user, key, fingerprint):
        return existing, False
    approver = _approve_checkout_discount(user, data)
    try:
        with transaction.atomic():
            return _write_sale(user, data, key, fingerprint, approver), True
    except IntegrityError:
        if existing := _replay(user, key, fingerprint):
            return existing, False
        raise


def _write_sale(user: User, data: dict, key, fingerprint: str, approver: User | None) -> Sale:
    store = StoreSettings.load()
    items = resolve_items(data["lines"], lock=True)
    subtotal = sum(variant.price_paise * quantity for variant, quantity in items)
    amount = discount_paise(data.get("discount"), subtotal)
    limit = cashier_limit_paise(user, subtotal, store)
    # Prices may have moved since the approval was checked: an over-limit discount still needs one.
    if _above_limit(amount, limit) and approver is None:
        raise ValidationError(
            {"approval_pin": ["This discount is above your limit. A Senior cashier or Admin must approve it."]}
        )
    if not amount:
        approver = None
    bill = price_bill(items, amount, store.prices_include_tax)

    if bill.total_paise != data["expected_total_paise"]:
        raise TotalChanged(
            f"The total is now ₹{bill.total_paise / 100:,.2f}, not the ₹{data['expected_total_paise'] / 100:,.2f} "
            "shown. Check the bill and confirm the new total."
        )
    payment = data["payment"]
    tendered = payment.get("tendered_paise")
    if payment["method"] == Payment.Method.CASH and (tendered is None or tendered < bill.total_paise):
        raise ValidationError({"payment.tendered_paise": ["The cash received is less than the total."]})

    counter, _ = InvoiceCounter.objects.select_for_update().get_or_create(series=INVOICE_SERIES)
    counter.last_number += 1
    counter.save(update_fields=["last_number"])

    sale = Sale.objects.create(
        invoice_no=f"{INVOICE_SERIES}-{counter.last_number:06d}",
        cashier=user,
        cashier_name=user.full_name,
        idempotency_key=key,
        request_hash=fingerprint,
        prices_include_tax=bill.prices_include_tax,
        subtotal_paise=bill.subtotal_paise,
        discount_paise=bill.discount_paise,
        taxable_paise=bill.taxable_paise,
        tax_paise=bill.tax_paise,
        total_paise=bill.total_paise,
        discount_approved_by=approver,
        discount_approved_by_name=approver.full_name if approver else "",
        store_name=store.name,
        store_code=store.code,
        store_address=store.address,
        store_state=store.state,
        store_gstin=store.gstin,
    )
    SaleLine.objects.bulk_create(
        SaleLine(
            sale=sale,
            variant=line.variant,
            product_name=line.variant.product.name,
            product_sku=line.variant.product.sku,
            variant_sku=line.variant.sku,
            size=line.variant.size,
            colour=line.variant.colour,
            hsn_code=line.variant.product.effective_hsn_code,
            quantity=line.quantity,
            unit_price_paise=line.unit_price_paise,
            subtotal_paise=line.subtotal_paise,
            discount_paise=line.discount_paise,
            taxable_paise=line.taxable_paise,
            tax_rate_bp=line.tax_rate_bp,
            tax_paise=line.tax_paise,
            total_paise=line.total_paise,
        )
        for line in bill.lines
    )
    Payment.objects.create(
        sale=sale,
        method=payment["method"],
        amount_paise=bill.total_paise,
        tendered_paise=tendered if payment["method"] == Payment.Method.CASH else None,
        change_paise=(tendered - bill.total_paise) if payment["method"] == Payment.Method.CASH else 0,
        reference=payment.get("reference", ""),
    )
    for index, line in enumerate(bill.lines):
        try:
            record_movement(
                variant=line.variant,
                type=StockMovement.Type.SALE,
                quantity_delta=-line.quantity,
                actor=user,
                reference=sale.invoice_no,
            )
        except StockError as error:
            # Only reachable if stock moved between the lock and here; the whole sale rolls back.
            raise ValidationError({"lines": [{} if i != index else {"quantity": [str(error)]} for i in range(len(bill.lines))]})
    return sale
