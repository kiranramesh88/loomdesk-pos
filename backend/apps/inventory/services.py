from django.db import transaction
from rest_framework import status
from rest_framework.exceptions import APIException, ValidationError

from apps.catalog.models import Variant

from .models import StockMovement

# Movement types that must explain themselves.
REASON_REQUIRED = {StockMovement.Type.ADJUST_REMOVE, StockMovement.Type.COUNT}


class StockError(ValueError):
    pass


@transaction.atomic
def record_movement(
    *,
    variant: Variant,
    type: str,
    quantity_delta: int,
    actor=None,
    reason: str = "",
    reference: str = "",
) -> StockMovement:
    """The only supported way to change stock. Locks the variant row so concurrent sales can't oversell."""
    if quantity_delta == 0 and type != StockMovement.Type.COUNT:
        raise StockError("Quantity must not be zero.")
    if type in REASON_REQUIRED and not reason.strip():
        raise StockError("A reason is required for this adjustment.")

    locked = Variant.objects.select_for_update().get(pk=variant.pk)
    new_balance = locked.on_hand + quantity_delta
    if new_balance < 0:
        raise StockError(f"Only {locked.on_hand} in stock; stock cannot go negative.")

    locked.on_hand = new_balance
    locked.save(update_fields=["on_hand"])
    variant.on_hand = new_balance
    return StockMovement.objects.create(
        variant=locked,
        type=type,
        quantity_delta=quantity_delta,
        balance_after=new_balance,
        reason=reason,
        reference=reference,
        actor=actor,
    )


class StockChanged(APIException):
    """Stock moved (a sale, another adjustment) after the adjustment was previewed."""

    status_code = status.HTTP_409_CONFLICT
    default_code = "stock_changed"


ADJUSTMENT_TYPES = {
    "add": StockMovement.Type.ADJUST_ADD,
    "remove": StockMovement.Type.ADJUST_REMOVE,
    "count": StockMovement.Type.COUNT,
}


@transaction.atomic
def adjust_stock(*, variant: Variant, kind: str, quantity: int, reason: str, expected_on_hand: int, actor) -> StockMovement:
    """A manual adjustment by staff, recorded as one movement. All or nothing.

    The variant is locked first, so the figure the user previewed is compared with the real one
    under the same lock that writes the movement: a sale in between can't be silently overwritten.
    """
    locked = Variant.objects.select_for_update().get(pk=variant.pk)
    if locked.on_hand != expected_on_hand:
        raise StockChanged(
            f"Stock changed from {expected_on_hand} to {locked.on_hand} since this adjustment was opened. "
            "Check the new figure and confirm again."
        )
    delta = {"add": quantity, "remove": -quantity, "count": quantity - locked.on_hand}[kind]
    try:
        return record_movement(variant=locked, type=ADJUSTMENT_TYPES[kind], quantity_delta=delta, actor=actor, reason=reason)
    except StockError as error:
        raise ValidationError({"quantity": [str(error)]}) from None
