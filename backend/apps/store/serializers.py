from django.utils import timezone
from rest_framework import serializers

from .gst import STATES, gstin_problem
from .models import StoreSettings


class StoreSerializer(serializers.ModelSerializer):
    """Identity shown in the admin shell. Settings such as tax and discount limits are not exposed here."""

    today = serializers.SerializerMethodField(
        help_text="The store's current date. Date filters (e.g. today's sales) use store dates, not the device's.",
    )

    class Meta:
        model = StoreSettings
        fields = ["name", "code", "state", "today"]
        read_only_fields = fields

    def get_today(self, store) -> str:
        return timezone.localdate().isoformat()


class StoreSettingsSerializer(serializers.ModelSerializer):
    """The store's details, printed on future receipts, and its pricing rules. Admin only."""

    states = serializers.SerializerMethodField(help_text="GST states and union territories the store can be in.")

    class Meta:
        model = StoreSettings
        fields = ["name", "code", "address", "state", "gstin", "prices_include_tax", "cashier_discount_limit_pct", "states"]
        read_only_fields = fields

    def get_states(self, store) -> list[str]:
        return STATES


class StoreSettingsUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120, required=False)
    code = serializers.RegexField(
        r"^[A-Z0-9][A-Z0-9-]{0,19}$",
        required=False,
        error_messages={"invalid": "Use up to 20 capital letters, digits and hyphens, e.g. LL-KKD-01."},
    )
    address = serializers.CharField(max_length=300, required=False)
    state = serializers.CharField(max_length=60, required=False)
    gstin = serializers.CharField(max_length=15, required=False, allow_blank=True)
    prices_include_tax = serializers.BooleanField(required=False)
    cashier_discount_limit_pct = serializers.IntegerField(
        min_value=0,
        max_value=100,
        required=False,
        error_messages={"min_value": "Enter 0 to 100.", "max_value": "Enter 0 to 100."},
    )

    def to_internal_value(self, data):
        # Codes and GSTINs are capitals; accept them typed in lower case.
        if isinstance(data, dict):
            data = {**data}
            for key in ("code", "gstin"):
                if isinstance(data.get(key), str):
                    data[key] = data[key].strip().upper()
        return super().to_internal_value(data)

    def validate(self, attrs):
        store = self.context["store"]
        state = attrs.get("state", store.state)
        # An existing state outside the list (set before this check existed) can stay as it is.
        if "state" in attrs and attrs["state"] != store.state and attrs["state"] not in STATES:
            raise serializers.ValidationError({"state": ["Choose a state or union territory from the list."]})
        gstin = attrs.get("gstin", store.gstin)
        if gstin and ("gstin" in attrs or "state" in attrs):
            problem = gstin_problem(gstin, state)
            if problem:
                field = "gstin" if "gstin" in attrs else "state"
                raise serializers.ValidationError({field: [problem]})
        return attrs
