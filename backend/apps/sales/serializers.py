from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.accounts.models import User
from apps.catalog.models import Category, Product, Variant
from apps.catalog.serializers import STOCK_STATES, TaxRuleSerializer
from apps.catalog.validators import MAX_PRICE_PAISE

from .models import Payment, Sale, SaleLine
from .pricing import tax_breakdown

MAX_LINES = 100
MAX_QUANTITY = 999
DISCOUNT_KINDS = ["amount", "percent"]


# --- Staff catalogue: only what a till needs. No cost prices, movement history or admin fields. ---


class SellableVariantSerializer(serializers.ModelSerializer):
    price_paise = serializers.IntegerField(read_only=True)
    stock_state = serializers.ChoiceField(choices=STOCK_STATES, read_only=True)

    class Meta:
        model = Variant
        fields = ["id", "sku", "size", "colour", "barcode", "price_paise", "on_hand", "stock_state"]
        read_only_fields = fields


class SellableProductSerializer(serializers.ModelSerializer):
    category = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()
    tax_rule = serializers.SerializerMethodField()
    hsn_code = serializers.CharField(source="effective_hsn_code", read_only=True)
    variants = SellableVariantSerializer(source="sellable_variants", many=True, read_only=True)

    class Meta:
        model = Product
        fields = ["id", "name", "sku", "category", "image_url", "hsn_code", "tax_rule", "variants"]
        read_only_fields = fields

    @extend_schema_field({"type": "object", "properties": {"id": {"type": "integer"}, "name": {"type": "string"}}, "required": ["id", "name"]})
    def get_category(self, product: Product) -> dict:
        return {"id": product.category_id, "name": product.category.name}

    def get_image_url(self, product: Product) -> str | None:
        return product.image.url if product.image else None

    @extend_schema_field(TaxRuleSerializer)
    def get_tax_rule(self, product: Product) -> dict:
        return TaxRuleSerializer(product.effective_tax_rule).data


class BillingCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name"]
        read_only_fields = fields


class ApproverSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "full_name", "role"]
        read_only_fields = fields


class BillingSettingsSerializer(serializers.Serializer):
    """What the till needs to know about the store. No GSTIN, address or other admin settings."""

    store_name = serializers.CharField()
    store_code = serializers.CharField()
    prices_include_tax = serializers.BooleanField()
    cashier_discount_limit_pct = serializers.IntegerField()


# --- Requests. The client sends choices only; prices, tax and totals are the server's. ---


class BillLineInputSerializer(serializers.Serializer):
    variant = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(
        min_value=1, max_value=MAX_QUANTITY, error_messages={"min_value": "Quantity must be at least 1."}
    )


class DiscountInputSerializer(serializers.Serializer):
    """`amount` is paise; `percent` is basis points (1000 = 10%)."""

    kind = serializers.ChoiceField(choices=DISCOUNT_KINDS)
    value = serializers.IntegerField(min_value=0)

    def validate(self, attrs):
        if attrs["kind"] == "percent" and attrs["value"] > 10_000:
            raise serializers.ValidationError({"value": "A percentage discount can’t be more than 100%."})
        if attrs["kind"] == "amount" and attrs["value"] > MAX_PRICE_PAISE:
            raise serializers.ValidationError({"value": "That discount is too large."})
        return attrs


class BillSerializer(serializers.Serializer):
    lines = BillLineInputSerializer(many=True, allow_empty=False, max_length=MAX_LINES)
    discount = DiscountInputSerializer(required=False, allow_null=True)


class PaymentInputSerializer(serializers.Serializer):
    method = serializers.ChoiceField(choices=Payment.Method.choices)
    tendered_paise = serializers.IntegerField(min_value=0, max_value=MAX_PRICE_PAISE, required=False, allow_null=True)
    reference = serializers.CharField(max_length=40, required=False, allow_blank=True, trim_whitespace=True)

    def validate(self, attrs):
        method = attrs["method"]
        if method == Payment.Method.CASH:
            if attrs.get("tendered_paise") is None:
                raise serializers.ValidationError({"tendered_paise": "Enter the cash received."})
            attrs["reference"] = ""
        elif not attrs.get("reference"):
            label = "UPI transaction ID" if method == Payment.Method.UPI else "card approval code"
            raise serializers.ValidationError({"reference": f"Enter the {label} shown on the confirmation."})
        return attrs


class CheckoutSerializer(BillSerializer):
    payment = PaymentInputSerializer()
    # The total the cashier confirmed. If the server's total differs, nothing is saved (409).
    expected_total_paise = serializers.IntegerField(min_value=0)
    approver_id = serializers.IntegerField(required=False, allow_null=True)
    approval_pin = serializers.RegexField(r"^\d{4,6}$", required=False, allow_blank=True, write_only=True)


# --- Responses ---


class QuoteLineSerializer(serializers.Serializer):
    variant = serializers.IntegerField(source="variant.id")
    quantity = serializers.IntegerField()
    # Stock now, so the bill can stop the quantity at what is on the shelf.
    on_hand = serializers.IntegerField(source="variant.on_hand")
    unit_price_paise = serializers.IntegerField()
    subtotal_paise = serializers.IntegerField()
    discount_paise = serializers.IntegerField()
    taxable_paise = serializers.IntegerField()
    tax_rate_bp = serializers.IntegerField()
    tax_paise = serializers.IntegerField()
    total_paise = serializers.IntegerField()


class TaxBreakdownSerializer(serializers.Serializer):
    rate_bp = serializers.IntegerField()
    taxable_paise = serializers.IntegerField()
    tax_paise = serializers.IntegerField()
    cgst_paise = serializers.IntegerField()
    sgst_paise = serializers.IntegerField()


class QuoteSerializer(serializers.Serializer):
    lines = QuoteLineSerializer(many=True)
    prices_include_tax = serializers.BooleanField()
    subtotal_paise = serializers.IntegerField()
    discount_paise = serializers.IntegerField()
    taxable_paise = serializers.IntegerField()
    tax_paise = serializers.IntegerField()
    total_paise = serializers.IntegerField()
    tax_breakdown = TaxBreakdownSerializer(many=True)
    # Largest discount this user may give without approval; null when they need none.
    discount_limit_paise = serializers.IntegerField(allow_null=True)
    needs_approval = serializers.BooleanField()


class SaleLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = SaleLine
        fields = [
            "id", "variant", "product_name", "product_sku", "variant_sku", "size", "colour", "hsn_code", "quantity",
            "unit_price_paise", "subtotal_paise", "discount_paise", "taxable_paise", "tax_rate_bp", "tax_paise",
            "total_paise",
        ]
        read_only_fields = fields


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = ["method", "amount_paise", "tendered_paise", "change_paise", "reference", "gateway_verified", "recorded_at"]
        read_only_fields = fields


class SaleSerializer(serializers.ModelSerializer):
    """A saved sale as its receipt shows it. Every figure comes from the stored snapshot."""

    lines = SaleLineSerializer(many=True, read_only=True)
    payment = PaymentSerializer(read_only=True)
    tax_breakdown = serializers.SerializerMethodField()
    store = serializers.SerializerMethodField()
    discount_approved_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Sale
        fields = [
            "invoice_no", "status", "created_at", "cashier_name", "store", "prices_include_tax", "subtotal_paise",
            "discount_paise", "taxable_paise", "tax_paise", "total_paise", "discount_approved_by_name", "lines",
            "tax_breakdown", "payment",
        ]
        read_only_fields = fields

    @extend_schema_field({"type": "string", "nullable": True})
    def get_discount_approved_by_name(self, sale: Sale) -> str | None:
        return sale.discount_approved_by_name or None

    @extend_schema_field(TaxBreakdownSerializer(many=True))
    def get_tax_breakdown(self, sale: Sale) -> list[dict]:
        return tax_breakdown(sale.lines.all())

    @extend_schema_field(
        {
            "type": "object",
            "properties": {key: {"type": "string"} for key in ("name", "code", "address", "state", "gstin")},
            "required": ["name", "code", "address", "state", "gstin"],
        }
    )
    def get_store(self, sale: Sale) -> dict:
        return {
            "name": sale.store_name,
            "code": sale.store_code,
            "address": sale.store_address,
            "state": sale.store_state,
            "gstin": sale.store_gstin,
        }


# --- Sales history (Phase 5). Every figure is the saved snapshot, never today's catalogue or tax rules. ---


class SaleListItemSerializer(serializers.ModelSerializer):
    item_count = serializers.IntegerField(read_only=True, help_text="Units sold on the bill (sum of line quantities).")
    payment_method = serializers.ChoiceField(source="payment.method", choices=Payment.Method.choices, read_only=True)
    gateway_verified = serializers.BooleanField(source="payment.gateway_verified", read_only=True)

    class Meta:
        model = Sale
        fields = [
            "invoice_no", "status", "created_at", "cashier", "cashier_name", "item_count", "discount_paise",
            "total_paise", "payment_method", "gateway_verified",
        ]
        read_only_fields = fields


class SaleCashierSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "full_name", "role", "is_active"]
        read_only_fields = fields


class SummaryGroupSerializer(serializers.Serializer):
    sale_count = serializers.IntegerField()
    total_paise = serializers.IntegerField()


class MethodSummarySerializer(SummaryGroupSerializer):
    method = serializers.ChoiceField(choices=Payment.Method.choices)


class DaySummarySerializer(SummaryGroupSerializer):
    date = serializers.DateField()


class CashierSummarySerializer(SummaryGroupSerializer):
    cashier = serializers.IntegerField()
    cashier_name = serializers.CharField()


class SalesSummarySerializer(serializers.Serializer):
    """Completed sales matching the filters, summed from their saved totals (GST included, after discounts)."""

    sale_count = serializers.IntegerField()
    total_paise = serializers.IntegerField()
    subtotal_paise = serializers.IntegerField()
    discount_paise = serializers.IntegerField()
    tax_paise = serializers.IntegerField()
    by_method = MethodSummarySerializer(many=True)
    by_day = DaySummarySerializer(many=True)
    by_cashier = CashierSummarySerializer(many=True)
