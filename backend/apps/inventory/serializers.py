from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.catalog.models import Variant
from apps.catalog.serializers import STOCK_STATES

from .models import StockMovement

# Largest single adjustment; anything bigger is almost certainly a typo for a smaller number.
MAX_ADJUSTMENT = 10_000

ADJUSTMENT_KINDS = [
    ("add", "Add stock"),
    ("remove", "Remove stock"),
    ("count", "Set counted quantity"),
]


class InventoryProductSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    sku = serializers.CharField()
    status = serializers.CharField()
    category = serializers.CharField(source="category.name")
    image_url = serializers.SerializerMethodField()

    def get_image_url(self, product) -> str | None:
        return product.image.url if product.image else None


class InventoryVariantSerializer(serializers.ModelSerializer):
    """A stock-tracked variant with its product, stock state and most recent movement."""

    product = InventoryProductSerializer(read_only=True)
    stock_state = serializers.ChoiceField(choices=STOCK_STATES, read_only=True)
    sellable = serializers.BooleanField(read_only=True, help_text="Active variant of an active product.")
    product_on_hand = serializers.IntegerField(read_only=True, help_text="Units across all of the product's variants.")
    last_movement_at = serializers.DateTimeField(read_only=True, allow_null=True)
    last_movement_type = serializers.ChoiceField(choices=StockMovement.Type.choices, read_only=True, allow_null=True)

    class Meta:
        model = Variant
        fields = [
            "id", "sku", "size", "colour", "barcode", "on_hand", "reorder_level", "stock_state", "is_active", "sellable",
            "product", "product_on_hand", "last_movement_at", "last_movement_type",
        ]
        read_only_fields = fields


class InventorySummarySerializer(serializers.Serializer):
    tracked_variants = serializers.IntegerField(help_text="Active variants of active products.")
    low_stock = serializers.IntegerField(help_text="Tracked variants with 1 to reorder-level units.")
    out_of_stock = serializers.IntegerField(help_text="Tracked variants with no units.")
    units_on_hand = serializers.IntegerField(help_text="Units across tracked variants.")


class MovementVariantSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    sku = serializers.CharField()
    size = serializers.CharField()
    colour = serializers.CharField()
    product_id = serializers.IntegerField()
    product_name = serializers.CharField(source="product.name")


class InventoryMovementSerializer(serializers.ModelSerializer):
    """One entry of the append-only stock ledger."""

    type_label = serializers.CharField(source="get_type_display", read_only=True)
    variant = MovementVariantSerializer(read_only=True)
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = StockMovement
        fields = [
            "id", "created_at", "type", "type_label", "quantity_delta", "balance_after", "reason", "reference",
            "actor_name", "variant",
        ]
        read_only_fields = fields

    @extend_schema_field({"type": "string", "nullable": True})
    def get_actor_name(self, movement) -> str | None:
        return movement.actor.full_name if movement.actor else None


class StockAdjustmentSerializer(serializers.Serializer):
    variant = serializers.PrimaryKeyRelatedField(queryset=Variant.objects.select_related("product"))
    kind = serializers.ChoiceField(choices=ADJUSTMENT_KINDS)
    quantity = serializers.IntegerField(
        min_value=0, max_value=MAX_ADJUSTMENT, help_text="Units to add or remove, or the counted quantity."
    )
    reason = serializers.CharField(max_length=200, help_text="Why stock changed; recorded on the movement.")
    expected_on_hand = serializers.IntegerField(
        min_value=0, help_text="The on-hand figure the adjustment was previewed against."
    )

    def validate_reason(self, value: str) -> str:
        value = value.strip()
        if len(value) < 3:
            raise serializers.ValidationError("Say why stock is changing (at least 3 characters).")
        return value

    def validate(self, attrs):
        if attrs["kind"] in ("add", "remove") and attrs["quantity"] < 1:
            raise serializers.ValidationError({"quantity": ["Enter at least 1 unit."]})
        return attrs


class StockAdjustmentResultSerializer(serializers.Serializer):
    movement = InventoryMovementSerializer()
    variant = InventoryVariantSerializer()
