from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.sales.models import Payment, Sale, SaleLine
from apps.sales.serializers import MAX_LINES, MAX_QUANTITY

from .models import Refund, Return, ReturnLine

# --- Requests: what comes back and how the money goes back. Every amount is the server's. ---


class ReturnLineInputSerializer(serializers.Serializer):
    sale_line = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(
        min_value=1, max_value=MAX_QUANTITY, error_messages={"min_value": "Quantity must be at least 1."}
    )
    disposition = serializers.ChoiceField(choices=ReturnLine.Disposition.choices)


class RefundInputSerializer(serializers.Serializer):
    method = serializers.ChoiceField(choices=Payment.Method.choices)
    reference = serializers.CharField(max_length=40, required=False, allow_blank=True, trim_whitespace=True)

    def validate(self, attrs):
        if attrs["method"] == Payment.Method.CASH:
            attrs["reference"] = ""
        elif not attrs.get("reference"):
            label = "UPI transaction ID" if attrs["method"] == Payment.Method.UPI else "card refund reference"
            raise serializers.ValidationError({"reference": f"Enter the {label}."})
        return attrs


class ReturnRequestSerializer(serializers.Serializer):
    invoice_no = serializers.CharField(max_length=20)
    reason = serializers.ChoiceField(choices=Return.Reason.choices)
    note = serializers.CharField(max_length=200, required=False, allow_blank=True, trim_whitespace=True, default="")
    lines = ReturnLineInputSerializer(many=True, allow_empty=False, max_length=MAX_LINES)
    refund = RefundInputSerializer()

    def validate(self, attrs):
        if attrs["reason"] == Return.Reason.OTHER and not attrs.get("note"):
            raise serializers.ValidationError({"note": "Say why the items came back."})
        return attrs


class ReturnCreateSerializer(ReturnRequestSerializer):
    # The refund the user reviewed. If the server's figure differs, nothing is saved (409 refund_changed).
    expected_total_paise = serializers.IntegerField(min_value=0)


# --- Responses ---


class RefundFiguresSerializer(serializers.Serializer):
    subtotal_paise = serializers.IntegerField()
    discount_paise = serializers.IntegerField()
    taxable_paise = serializers.IntegerField()
    tax_paise = serializers.IntegerField()
    total_paise = serializers.IntegerField()


class QuotedLineSerializer(RefundFiguresSerializer):
    sale_line = serializers.IntegerField(source="sale_line.pk")
    quantity = serializers.IntegerField()
    disposition = serializers.ChoiceField(choices=ReturnLine.Disposition.choices)


class ReturnQuoteSerializer(serializers.Serializer):
    invoice_no = serializers.CharField()
    lines = QuotedLineSerializer(many=True)
    totals = RefundFiguresSerializer()


class ReturnableLineSerializer(serializers.ModelSerializer):
    returned = serializers.SerializerMethodField()
    eligible = serializers.SerializerMethodField()

    class Meta:
        model = SaleLine
        fields = [
            "id", "product_name", "variant_sku", "size", "colour", "quantity", "unit_price_paise", "discount_paise",
            "tax_rate_bp", "total_paise", "returned", "eligible",
        ]
        read_only_fields = fields

    def get_returned(self, line: SaleLine) -> int:
        return self.context["returned"].get(line.pk, 0)

    def get_eligible(self, line: SaleLine) -> int:
        return line.quantity - self.get_returned(line)


class ReturnableSaleSerializer(serializers.ModelSerializer):
    """A sale as the return wizard needs it: what was sold, what already came back, what still can."""

    lines = serializers.SerializerMethodField()
    payment_method = serializers.ChoiceField(source="payment.method", choices=Payment.Method.choices, read_only=True)
    refund_methods = serializers.SerializerMethodField()
    returns = serializers.SerializerMethodField()
    can_return = serializers.SerializerMethodField()

    class Meta:
        model = Sale
        fields = [
            "invoice_no", "status", "created_at", "cashier_name", "total_paise", "payment_method", "refund_methods",
            "can_return", "lines", "returns",
        ]
        read_only_fields = fields

    @extend_schema_field(ReturnableLineSerializer(many=True))
    def get_lines(self, sale: Sale) -> list[dict]:
        return ReturnableLineSerializer(sale.lines.all(), many=True, context=self.context).data

    @extend_schema_field(serializers.ListField(child=serializers.ChoiceField(choices=Payment.Method.choices)))
    def get_refund_methods(self, sale: Sale) -> list[str]:
        return self.context["refund_methods"]

    @extend_schema_field(
        {"type": "array", "items": {"type": "object", "properties": {"number": {"type": "string"}, "total_paise": {"type": "integer"}}, "required": ["number", "total_paise"]}}
    )
    def get_returns(self, sale: Sale) -> list[dict]:
        return [{"number": r.number, "total_paise": r.total_paise} for r in sale.returns.order_by("id")]

    def get_can_return(self, sale: Sale) -> bool:
        returned = self.context["returned"]
        return sale.status == Sale.Status.COMPLETED and any(
            line.quantity > returned.get(line.pk, 0) for line in sale.lines.all()
        )


class ReturnLineSerializer(serializers.ModelSerializer):
    sale_line = serializers.IntegerField(source="sale_line_id", read_only=True)
    product_name = serializers.CharField(source="sale_line.product_name", read_only=True)
    variant_sku = serializers.CharField(source="sale_line.variant_sku", read_only=True)
    variant = serializers.IntegerField(source="sale_line.variant_id", read_only=True)
    size = serializers.CharField(source="sale_line.size", read_only=True)
    colour = serializers.CharField(source="sale_line.colour", read_only=True)
    sold_quantity = serializers.IntegerField(source="sale_line.quantity", read_only=True)

    class Meta:
        model = ReturnLine
        fields = [
            "id", "sale_line", "variant", "product_name", "variant_sku", "size", "colour", "sold_quantity", "quantity",
            "disposition", "subtotal_paise", "discount_paise", "taxable_paise", "tax_paise", "total_paise",
        ]
        read_only_fields = fields


class RefundSerializer(serializers.ModelSerializer):
    recorded_by_name = serializers.CharField(source="ret.created_by_name", read_only=True)

    class Meta:
        model = Refund
        fields = ["method", "amount_paise", "reference", "gateway_verified", "recorded_at", "recorded_by_name"]
        read_only_fields = fields


class ReturnSerializer(serializers.ModelSerializer):
    invoice_no = serializers.CharField(source="sale.invoice_no", read_only=True)
    sale_created_at = serializers.DateTimeField(source="sale.created_at", read_only=True)
    lines = ReturnLineSerializer(many=True, read_only=True)
    refund = RefundSerializer(read_only=True)

    class Meta:
        model = Return
        fields = [
            "number", "created_at", "created_by_name", "invoice_no", "sale_created_at", "reason", "note",
            "subtotal_paise", "discount_paise", "taxable_paise", "tax_paise", "total_paise", "lines", "refund",
        ]
        read_only_fields = fields


class ReturnListItemSerializer(serializers.ModelSerializer):
    invoice_no = serializers.CharField(source="sale.invoice_no", read_only=True)
    units = serializers.IntegerField(read_only=True)
    refund_method = serializers.ChoiceField(source="refund.method", choices=Payment.Method.choices, read_only=True)
    dispositions = serializers.SerializerMethodField()

    class Meta:
        model = Return
        fields = [
            "number", "created_at", "invoice_no", "reason", "units", "total_paise", "refund_method", "dispositions",
            "created_by_name",
        ]
        read_only_fields = fields

    @extend_schema_field(serializers.ListField(child=serializers.ChoiceField(choices=ReturnLine.Disposition.choices)))
    def get_dispositions(self, ret: Return) -> list[str]:
        found = {line.disposition for line in ret.lines.all()}
        return [d for d in ReturnLine.Disposition.values if d in found]
