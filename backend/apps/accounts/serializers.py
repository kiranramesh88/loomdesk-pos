from rest_framework import serializers

from .models import Role, User


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


# --- Staff management (admin only) ---


class StaffSerializer(serializers.ModelSerializer):
    """A staff account as the admin sees it. Never includes the password, PIN or a link."""

    initials = serializers.CharField(read_only=True)
    has_pin = serializers.SerializerMethodField()
    password_set = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "full_name",
            "initials",
            "role",
            "is_active",
            "has_pin",
            "password_set",
            "setup_link_issued_at",
            "last_login",
            "date_joined",
        ]
        read_only_fields = fields

    def get_has_pin(self, user) -> bool:
        return bool(user.approval_pin_hash)

    def get_password_set(self, user) -> bool:
        """False until the person uses their first set-password link."""
        return user.has_usable_password()


class StaffCreateSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)
    full_name = serializers.CharField(max_length=120)
    role = serializers.ChoiceField(choices=Role.choices)


class StaffUpdateSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254, required=False)
    full_name = serializers.CharField(max_length=120, required=False)
    role = serializers.ChoiceField(choices=Role.choices, required=False)


class SetupLinkSerializer(serializers.Serializer):
    """Shown once: the server keeps no copy of the link."""

    path = serializers.CharField()
    expires_at = serializers.DateTimeField()


class StaffCreatedSerializer(serializers.Serializer):
    staff = StaffSerializer()
    setup_link = SetupLinkSerializer()


class PinSerializer(serializers.Serializer):
    pin = serializers.RegexField(r"^\d{4,6}$", write_only=True, error_messages={"invalid": "Enter a PIN of 4 to 6 digits."})


class SetPasswordLinkSerializer(serializers.Serializer):
    full_name = serializers.CharField()
    email = serializers.EmailField()


class SetPasswordSerializer(serializers.Serializer):
    uid = serializers.CharField(max_length=64)
    token = serializers.CharField(max_length=128)
    password = serializers.CharField(trim_whitespace=False, write_only=True, max_length=128)
