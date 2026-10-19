import pytest

from apps.catalog.models import Category, Product, TaxRule, Variant
from apps.inventory.models import StockMovement
from apps.inventory.services import StockError, record_movement


@pytest.fixture
def variant(db):
    rule = TaxRule.objects.create(name="Flat 5", kind="flat", flat_rate_bp=500)
    category = Category.objects.create(name="Shirts", slug="shirts", hsn_code="6205", tax_rule=rule)
    product = Product.objects.create(name="Classic Cotton Shirt", category=category, base_price_paise=1199_00)
    return Variant.objects.create(product=product, size="M", colour="Blue", sku="SH-M-BLU", reorder_level=2)


def test_movements_maintain_on_hand(variant):
    record_movement(variant=variant, type=StockMovement.Type.OPENING, quantity_delta=5)
    movement = record_movement(variant=variant, type=StockMovement.Type.SALE, quantity_delta=-2, reference="LD-1")
    variant.refresh_from_db()
    assert variant.on_hand == 3
    assert movement.balance_after == 3
    assert variant.stock_state == "in_stock"


def test_stock_cannot_go_negative(variant):
    record_movement(variant=variant, type=StockMovement.Type.OPENING, quantity_delta=1)
    with pytest.raises(StockError):
        record_movement(variant=variant, type=StockMovement.Type.SALE, quantity_delta=-2)
    variant.refresh_from_db()
    assert variant.on_hand == 1
    assert variant.movements.count() == 1


def test_removal_requires_reason(variant):
    record_movement(variant=variant, type=StockMovement.Type.OPENING, quantity_delta=3)
    with pytest.raises(StockError):
        record_movement(variant=variant, type=StockMovement.Type.ADJUST_REMOVE, quantity_delta=-1)


def test_stock_states(variant):
    assert variant.stock_state == "out_of_stock"
    record_movement(variant=variant, type=StockMovement.Type.OPENING, quantity_delta=2)
    assert variant.stock_state == "low_stock"
