from rest_framework import serializers

from .models import StoreSettings


class StoreSerializer(serializers.ModelSerializer):
    """Identity shown in the admin shell. Settings such as tax and discount limits are not exposed here."""

    class Meta:
        model = StoreSettings
        fields = ["name", "code", "state"]
        read_only_fields = fields
