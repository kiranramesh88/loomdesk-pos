from django.db import transaction

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
