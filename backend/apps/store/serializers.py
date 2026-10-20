from django.utils import timezone
from rest_framework import serializers

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
