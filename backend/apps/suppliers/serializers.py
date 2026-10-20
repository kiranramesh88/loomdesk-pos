import re

from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.catalog.models import Variant

from .models import Purchase, PurchaseLine, Supplier, SupplierPayment
from .services import GST_RATES_BP

GSTIN = re.compile(r"^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")
PHONE = re.compile(r"^\+?[0-9 ()-]{6,20}$")
MAX_UNIT_COST_PAISE = 10_00_000_00  # ₹10,00,000 a unit
MAX_LINES = 100


def _not_future(value):
    if value > timezone.localdate():
        raise serializers.ValidationError("This date is in the future.")
    return value


def _user_name(user) -> str | None:
    return user.full_name if user else None


# --- Suppliers ---


class SupplierBalanceMixin(serializers.Serializer):
    received_paise = serializers.IntegerField(read_only=True, help_text="Received purchases, GST included.")
    paid_paise = serializers.IntegerField(read_only=True, help_text="Payments recorded by staff.")
    balance_paise = serializers.IntegerField(
        read_only=True, help_text="Recorded balance: received purchases minus recorded payments. Negative is an advance."
    )


class SupplierListSerializer(SupplierBalanceMixin, serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = [
            "id", "name", "category", "contact_name", "phone", "email", "status", "received_paise", "paid_paise",
            "balance_paise",
        ]
        read_only_fields = fields


class SupplierDetailSerializer(SupplierBalanceMixin, serializers.ModelSerializer):
    awaiting_paise = serializers.IntegerField(read_only=True, help_text="Purchases recorded but not yet received.")

    class Meta:
        model = Supplier
        fields = [
            "id", "name", "category", "contact_name", "phone", "email", "gstin", "address", "state", "notes", "status",
            "created_at", "updated_at", "received_paise", "awaiting_paise", "paid_paise", "balance_paise",
        ]
        read_only_fields = fields


class SupplierWriteSerializer(serializers.ModelSerializer):
    """Contact and business details only. Balances change through purchases and payments, never here."""

    class Meta:
        model = Supplier
        fields = ["name", "category", "contact_name", "phone", "email", "gstin", "address", "state", "notes", "status"]
        extra_kwargs = {"status": {"required": False}}

    def validate_name(self, value):
        value = value.strip()
        clash = Supplier.objects.filter(name__iexact=value)
        if self.instance:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError("A supplier with this name already exists.")
        return value

    def validate_category(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Enter what this supplier provides, e.g. Cotton basics.")
        return value

    def validate_phone(self, value):
        value = value.strip()
        if value and not PHONE.match(value):
            raise serializers.ValidationError("Use digits, spaces, brackets and dashes, e.g. +91 98765 12001.")
        return value

    def validate_gstin(self, value):
        value = value.strip().upper()
        if value and not GSTIN.match(value):
            raise serializers.ValidationError("A GSTIN has 15 characters, e.g. 32ABCDE1234F1Z5.")
        return value


# --- Purchases ---


class PurchaseLineInputSerializer(serializers.Serializer):
    variant = serializers.PrimaryKeyRelatedField(queryset=Variant.objects.select_related("product"))
    quantity = serializers.IntegerField(min_value=1, max_value=10_000)
    unit_cost_paise = serializers.IntegerField(min_value=1, max_value=MAX_UNIT_COST_PAISE, help_text="Cost per unit before GST.")
    tax_rate_bp = serializers.ChoiceField(
        choices=GST_RATES_BP,
        required=False,
        allow_null=True,
        help_text="GST on the supplier's invoice. Leave out to use the product's GST rule at this unit cost.",
    )


class PurchaseLinesSerializer(serializers.Serializer):
    lines = PurchaseLineInputSerializer(many=True)

    def validate_lines(self, lines):
        if not lines:
            raise serializers.ValidationError("Add at least one item.")
        if len(lines) > MAX_LINES:
            raise serializers.ValidationError(f"A purchase can have at most {MAX_LINES} items.")
        seen = set()
        for index, line in enumerate(lines):
            if line["variant"].pk in seen:
                raise serializers.ValidationError({index: {"variant": ["This variant is already on the purchase."]}})
            seen.add(line["variant"].pk)
        return lines


class PurchaseWriteSerializer(PurchaseLinesSerializer):
    supplier_invoice_no = serializers.CharField(max_length=40, required=False, allow_blank=True)
    purchase_date = serializers.DateField(validators=[_not_future], help_text="The supplier invoice date.")
    notes = serializers.CharField(max_length=1000, required=False, allow_blank=True)

    def validate_supplier_invoice_no(self, value):
        return value.strip()


class PricedLineSerializer(serializers.Serializer):
    variant = serializers.IntegerField(source="variant.pk")
    quantity = serializers.IntegerField()
    unit_cost_paise = serializers.IntegerField()
    tax_rate_bp = serializers.IntegerField()
    subtotal_paise = serializers.IntegerField()
    tax_paise = serializers.IntegerField()
    total_paise = serializers.IntegerField()


class PurchaseQuoteSerializer(serializers.Serializer):
    lines = PricedLineSerializer(many=True)
    subtotal_paise = serializers.IntegerField()
    tax_paise = serializers.IntegerField()
    total_paise = serializers.IntegerField()


class PurchaseLineSerializer(serializers.ModelSerializer):
    product_id = serializers.IntegerField(source="variant.product_id", read_only=True)

    class Meta:
        model = PurchaseLine
        fields = [
            "id", "variant", "product_id", "product_name", "variant_sku", "size", "colour", "quantity", "unit_cost_paise",
            "tax_rate_bp", "subtotal_paise", "tax_paise", "total_paise",
        ]
        read_only_fields = fields


class PurchaseListItemSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)
    item_count = serializers.IntegerField(read_only=True, help_text="Units on the purchase.")

    class Meta:
        model = Purchase
        fields = [
            "id", "number", "supplier", "supplier_name", "status", "supplier_invoice_no", "purchase_date", "item_count",
            "total_paise", "received_at",
        ]
        read_only_fields = fields


class PurchaseSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)
    supplier_status = serializers.CharField(source="supplier.status", read_only=True)
    lines = PurchaseLineSerializer(many=True, read_only=True)
    created_by_name = serializers.SerializerMethodField()
    received_by_name = serializers.SerializerMethodField()
    cancelled_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Purchase
        fields = [
            "id", "number", "supplier", "supplier_name", "supplier_status", "status", "supplier_invoice_no",
            "purchase_date", "notes", "subtotal_paise", "tax_paise", "total_paise", "lines", "created_at",
            "created_by_name", "received_at", "received_by_name", "cancelled_at", "cancelled_by_name", "cancel_reason",
        ]
        read_only_fields = fields

    @extend_schema_field({"type": "string", "nullable": True})
    def get_created_by_name(self, purchase) -> str | None:
        return _user_name(purchase.created_by)

    @extend_schema_field({"type": "string", "nullable": True})
    def get_received_by_name(self, purchase) -> str | None:
        return _user_name(purchase.received_by)

    @extend_schema_field({"type": "string", "nullable": True})
    def get_cancelled_by_name(self, purchase) -> str | None:
        return _user_name(purchase.cancelled_by)


class CancelPurchaseSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=200)

    def validate_reason(self, value):
        value = value.strip()
        if len(value) < 3:
            raise serializers.ValidationError("Say why this purchase is cancelled.")
        return value


# --- Payments and statement ---


class SupplierPaymentSerializer(serializers.ModelSerializer):
    recorded_by_name = serializers.CharField(source="recorded_by.full_name", read_only=True)
    gateway_verified = serializers.BooleanField(default=False, read_only=True, help_text="Always false: entered by staff.")

    class Meta:
        model = SupplierPayment
        fields = [
            "id", "paid_on", "amount_paise", "method", "reference", "notes", "recorded_by_name", "created_at",
            "gateway_verified",
        ]
        read_only_fields = fields


class SupplierPaymentWriteSerializer(serializers.ModelSerializer):
    paid_on = serializers.DateField(validators=[_not_future])
    amount_paise = serializers.IntegerField(min_value=1, max_value=10_00_00_000_00)

    class Meta:
        model = SupplierPayment
        fields = ["paid_on", "amount_paise", "method", "reference", "notes"]

    def validate_reference(self, value):
        return value.strip()

    def validate_notes(self, value):
        return value.strip()


class StatementEntrySerializer(serializers.Serializer):
    date = serializers.DateField()
    kind = serializers.ChoiceField(choices=[("purchase", "Purchase received"), ("payment", "Payment recorded")])
    reference = serializers.CharField()
    detail = serializers.CharField()
    debit_paise = serializers.IntegerField(help_text="Owed for goods received.")
    credit_paise = serializers.IntegerField(help_text="Paid, as recorded by staff.")
    balance_paise = serializers.IntegerField(help_text="Running recorded balance after this entry.")


class SupplierStatementSerializer(serializers.Serializer):
    entries = StatementEntrySerializer(many=True)
    balance_paise = serializers.IntegerField()
