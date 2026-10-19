from django.db import transaction
from django.db.models import Exists, OuterRef
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.inventory.models import StockMovement
from apps.inventory.services import record_movement

from .models import Category, Product, TaxRule, Variant
from .validators import MAX_PRICE_PAISE, BarcodeField, SkuField, validate_hsn

STOCK_STATES = ["in_stock", "low_stock", "out_of_stock"]
MAX_VARIANTS = 100
MAX_OPENING_STOCK = 100_000


def _pct(rate_bp: int) -> str:
    return f"{rate_bp / 100:g}%"


class TaxRuleSerializer(serializers.ModelSerializer):
    summary = serializers.SerializerMethodField()

    class Meta:
        model = TaxRule
        fields = ["id", "name", "kind", "flat_rate_bp", "threshold_paise", "lower_rate_bp", "upper_rate_bp", "summary"]
        read_only_fields = fields

    def get_summary(self, rule: TaxRule) -> str:
        """Plain-language rate, e.g. "5% up to ₹2,500 per unit, 18% above"."""
        if rule.kind == TaxRule.Kind.FLAT:
            return _pct(rule.flat_rate_bp or 0)
        return f"{_pct(rule.lower_rate_bp)} up to ₹{rule.threshold_paise // 100:,} per unit, {_pct(rule.upper_rate_bp)} above"


class CategorySerializer(serializers.ModelSerializer):
    tax_rule = TaxRuleSerializer(read_only=True)

    class Meta:
        model = Category
        fields = ["id", "name", "hsn_code", "tax_rule"]
        read_only_fields = fields


class CategoryRefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name"]
        read_only_fields = fields


def with_history(variants):
    """Annotate has_history: a variant with stock movements keeps its options and can't be deleted."""
    return variants.annotate(has_history=Exists(StockMovement.objects.filter(variant=OuterRef("pk"))))


def _image_url(product: Product) -> str | None:
    return product.image.url if product.image else None


class ProductListSerializer(serializers.ModelSerializer):
    """One catalogue row. Stock figures come from queryset annotations over active variants."""

    category = CategoryRefSerializer(read_only=True)
    image_url = serializers.SerializerMethodField()
    variant_count = serializers.IntegerField(read_only=True)
    total_on_hand = serializers.IntegerField(read_only=True)
    min_price_paise = serializers.IntegerField(read_only=True)
    max_price_paise = serializers.IntegerField(read_only=True)
    stock_state = serializers.ChoiceField(choices=STOCK_STATES, read_only=True)

    class Meta:
        model = Product
        fields = [
            "id", "name", "sku", "category", "image_url", "base_price_paise", "min_price_paise", "max_price_paise",
            "status", "variant_count", "total_on_hand", "stock_state", "updated_at",
        ]
        read_only_fields = fields

    def get_image_url(self, product: Product) -> str | None:
        return _image_url(product)


class VariantSerializer(serializers.ModelSerializer):
    price_paise = serializers.IntegerField(read_only=True)
    stock_state = serializers.ChoiceField(choices=STOCK_STATES, read_only=True)
    # Stock history pins a variant's size/colour and prevents deleting it.
    has_history = serializers.BooleanField(read_only=True)

    class Meta:
        model = Variant
        fields = [
            "id", "size", "colour", "sku", "barcode", "price_override_paise", "price_paise", "on_hand",
            "reorder_level", "is_active", "stock_state", "has_history",
        ]
        read_only_fields = fields


class StockMovementSerializer(serializers.ModelSerializer):
    type_label = serializers.CharField(source="get_type_display", read_only=True)
    variant_label = serializers.SerializerMethodField()
    actor_name = serializers.CharField(source="actor.full_name", read_only=True, default=None, allow_null=True)

    class Meta:
        model = StockMovement
        fields = [
            "id", "type", "type_label", "variant_label", "quantity_delta", "balance_after", "reason", "reference",
            "actor_name", "created_at",
        ]
        read_only_fields = fields

    def get_variant_label(self, movement: StockMovement) -> str:
        return f"{movement.variant.size} / {movement.variant.colour}"


class ProductDetailSerializer(serializers.ModelSerializer):
    category = CategorySerializer(read_only=True)
    tax_rule = TaxRuleSerializer(read_only=True)
    effective_tax_rule = TaxRuleSerializer(read_only=True)
    effective_hsn_code = serializers.CharField(read_only=True)
    image_url = serializers.SerializerMethodField()
    variants = serializers.SerializerMethodField()
    recent_movements = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id", "name", "sku", "description", "category", "base_price_paise", "cost_price_paise", "hsn_code",
            "effective_hsn_code", "tax_rule", "effective_tax_rule", "image_url", "status", "variants",
            "recent_movements", "created_at", "updated_at",
        ]
        read_only_fields = fields

    def get_image_url(self, product: Product) -> str | None:
        return _image_url(product)

    @extend_schema_field(VariantSerializer(many=True))
    def get_variants(self, product: Product) -> list[dict]:
        return VariantSerializer(with_history(product.variants.order_by("id")), many=True).data

    @extend_schema_field(StockMovementSerializer(many=True))
    def get_recent_movements(self, product: Product) -> list[dict]:
        recent = (
            StockMovement.objects.filter(variant__product=product)
            .select_related("variant", "actor")
            .order_by("-created_at", "-id")[:8]
        )
        return StockMovementSerializer(recent, many=True).data


class VariantWriteSerializer(serializers.Serializer):
    id = serializers.IntegerField(required=False)
    size = serializers.CharField(max_length=20, trim_whitespace=True)
    colour = serializers.CharField(max_length=30, trim_whitespace=True)
    sku = SkuField()
    barcode = BarcodeField()
    price_override_paise = serializers.IntegerField(
        required=False, allow_null=True, min_value=1, max_value=MAX_PRICE_PAISE
    )
    reorder_level = serializers.IntegerField(min_value=0, max_value=10_000, default=2)
    is_active = serializers.BooleanField(default=True)
    # Only for variants created by this request; existing stock changes go through Inventory.
    opening_stock = serializers.IntegerField(min_value=0, max_value=MAX_OPENING_STOCK, default=0)

    def validate(self, attrs):
        # A sent row replaces the stored variant, so an omitted optional field means "none".
        attrs.setdefault("barcode", None)
        attrs.setdefault("price_override_paise", None)
        return attrs


class VariantRowsSerializer(serializers.ListSerializer):
    """Every row is validated in full, even inside a partial PATCH: a sent variant list replaces the old one.

    Without this, DRF's partial mode would also skip required fields and defaults inside each row.
    """

    def run_child_validation(self, data):
        row = VariantWriteSerializer(data=data)
        if not row.is_valid():
            raise serializers.ValidationError(row.errors)
        return row.validated_data


class ProductWriteSerializer(serializers.ModelSerializer):
    """Create or update a product and its variants in one atomic request.

    Stock is never edited here. New variants may carry opening stock, which is recorded as an
    OPENING movement through inventory.services.record_movement (the only path that changes stock).
    """

    sku = SkuField()
    category = serializers.PrimaryKeyRelatedField(queryset=Category.objects.all())
    tax_rule = serializers.PrimaryKeyRelatedField(queryset=TaxRule.objects.all(), allow_null=True, required=False)
    base_price_paise = serializers.IntegerField(min_value=1, max_value=MAX_PRICE_PAISE)
    cost_price_paise = serializers.IntegerField(min_value=0, max_value=MAX_PRICE_PAISE, allow_null=True, required=False)
    hsn_code = serializers.CharField(max_length=8, allow_blank=True, required=False, validators=[validate_hsn])
    variants = VariantRowsSerializer(child=VariantWriteSerializer(), required=False)

    class Meta:
        model = Product
        fields = [
            "name", "sku", "description", "category", "base_price_paise", "cost_price_paise", "hsn_code",
            "tax_rule", "status", "variants",
        ]
        extra_kwargs = {"description": {"required": False, "allow_blank": True}}

    def validate_name(self, value: str) -> str:
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Enter a product name.")
        return value

    def validate(self, attrs):
        # Checked here rather than in validate_sku so a clash is reported together with any
        # variant clashes; DRF skips validate() entirely once a single field fails.
        errors = {}
        sku = attrs.get("sku")
        if sku and Product.objects.filter(sku=sku).exclude(pk=getattr(self.instance, "pk", None)).exists():
            errors["sku"] = ["Another product already uses this SKU."]
        try:
            self._validate_product(attrs)
        except serializers.ValidationError as exc:
            errors.update(exc.detail)
        if errors:
            raise serializers.ValidationError(errors)
        return attrs

    def _validate_product(self, attrs) -> None:
        variants = attrs.get("variants")
        if self.instance is None and variants is None:
            raise serializers.ValidationError({"variants": ["Add at least one variant."]})
        if variants is not None:
            self._validate_variants(variants)
        status = attrs.get("status", getattr(self.instance, "status", Product.Status.ACTIVE))
        if status == Product.Status.ACTIVE:
            active = (
                any(v["is_active"] for v in variants)
                if variants is not None
                else self.instance.variants.filter(is_active=True).exists()
            )
            if not active:
                raise serializers.ValidationError({"variants": ["An active product needs at least one active variant."]})

    def _validate_variants(self, variants: list[dict]) -> None:
        if not variants:
            raise serializers.ValidationError({"variants": ["Add at least one variant."]})
        if len(variants) > MAX_VARIANTS:
            raise serializers.ValidationError({"variants": [f"A product can have at most {MAX_VARIANTS} variants."]})

        existing = {v.pk: v for v in self._existing_variants()}
        errors: list[dict[str, list[str]]] = [{} for _ in variants]

        def flag(index: int, field: str, message: str):
            errors[index].setdefault(field, []).append(message)

        seen_options: dict[tuple[str, str], int] = {}
        seen_skus: dict[str, int] = {}
        seen_barcodes: dict[str, int] = {}
        for i, row in enumerate(variants):
            current = existing.get(row["id"]) if "id" in row else None
            if "id" in row and current is None:
                flag(i, "id", "This variant doesn’t belong to the product. Reload and try again.")
                continue
            if current is not None and row["opening_stock"]:
                flag(i, "opening_stock", "Opening stock is only for new variants. Use Inventory to adjust stock.")
            if current is not None and current.has_history and (
                row["size"] != current.size or row["colour"] != current.colour
            ):
                message = "This variant has stock history, so its size and colour are fixed. Add a new variant instead."
                flag(i, "size" if row["size"] != current.size else "colour", message)

            options = (row["size"].casefold(), row["colour"].casefold())
            if options in seen_options:
                flag(i, "colour", f"Variant {seen_options[options] + 1} already uses this size and colour.")
            seen_options.setdefault(options, i)
            if row["sku"] in seen_skus:
                flag(i, "sku", f"Variant {seen_skus[row['sku']] + 1} already uses this SKU.")
            seen_skus.setdefault(row["sku"], i)
            if row["barcode"]:
                if row["barcode"] in seen_barcodes:
                    flag(i, "barcode", f"Variant {seen_barcodes[row['barcode']] + 1} already uses this barcode.")
                seen_barcodes.setdefault(row["barcode"], i)

        # Codes already used by variants outside this product's own rows.
        own_ids = [row["id"] for row in variants if "id" in row]
        others = Variant.objects.exclude(pk__in=own_ids).select_related("product")
        if self.instance is not None:
            # A removed variant's codes are free again once this request deletes it.
            removed = set(existing) - set(own_ids)
            others = others.exclude(pk__in=removed)
        for clash in others.filter(sku__in=seen_skus):
            flag(seen_skus[clash.sku], "sku", f"{clash.product.name} already uses this SKU.")
        for clash in others.filter(barcode__in=seen_barcodes):
            flag(seen_barcodes[clash.barcode], "barcode", f"{clash.product.name} already uses this barcode.")

        if any(errors):
            raise serializers.ValidationError({"variants": errors})

        for variant in set(existing.values()) - {existing[i] for i in own_ids}:
            if variant.has_history:
                raise serializers.ValidationError(
                    {"variants": [f"{variant.size} / {variant.colour} has stock history, so it can’t be removed. Mark it inactive instead."]}
                )

    def _existing_variants(self):
        if self.instance is None:
            return Variant.objects.none()
        return with_history(self.instance.variants.all())

    @transaction.atomic
    def create(self, validated_data):
        variants = validated_data.pop("variants")
        product = Product.objects.create(**validated_data)
        self._create_variants(product, variants)
        return product

    @transaction.atomic
    def update(self, instance, validated_data):
        variants = validated_data.pop("variants", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        if variants is not None:
            kept = [row for row in variants if "id" in row]
            added = [row for row in variants if "id" not in row]
            instance.variants.exclude(pk__in=[row["id"] for row in kept]).delete()
            for row in kept:
                row.pop("opening_stock")
                Variant.objects.filter(pk=row.pop("id"), product=instance).update(**row)
            self._create_variants(instance, added)
        return instance

    def _create_variants(self, product: Product, rows: list[dict]) -> None:
        actor = self.context["request"].user
        for row in rows:
            opening = row.pop("opening_stock")
            variant = Variant.objects.create(product=product, **row)
            if opening:
                record_movement(
                    variant=variant,
                    type=StockMovement.Type.OPENING,
                    quantity_delta=opening,
                    actor=actor,
                    reason="Opening stock",
                    reference=product.sku,
                )


class ProductImageSerializer(serializers.Serializer):
    image = serializers.ImageField()

    MAX_BYTES = 5 * 1024 * 1024
    FORMATS = {"JPEG", "PNG", "WEBP"}

    def validate_image(self, image):
        if image.size > self.MAX_BYTES:
            raise serializers.ValidationError("Choose a photo under 5 MB.")
        # DRF's ImageField has already opened the file with Pillow; check what it really is.
        if getattr(image, "image", None) is None or image.image.format not in self.FORMATS:
            raise serializers.ValidationError("Use a JPEG, PNG or WebP photo.")
        return image
