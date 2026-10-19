from rest_framework import serializers

from .models import User


class PermissionsSerializer(serializers.Serializer):
    can_access_admin = serializers.BooleanField()
    can_approve_discounts = serializers.BooleanField()
    can_view_costs = serializers.BooleanField()


class MeSerializer(serializers.ModelSerializer):
    initials = serializers.CharField(read_only=True)
    permissions = PermissionsSerializer(source="*", read_only=True)

    class Meta:
        model = User
        fields = ["id", "email", "full_name", "initials", "role", "permissions"]
        read_only_fields = fields


class SessionSerializer(serializers.Serializer):
    user = MeSerializer(allow_null=True)


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(trim_whitespace=False, write_only=True)
