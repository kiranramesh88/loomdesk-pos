from rest_framework.permissions import BasePermission

from .models import Role


class HasRole(BasePermission):
    """Base for role checks. Every role-gated UI element must have a matching subclass in use."""

    allowed_roles: tuple[str, ...] = ()

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and user.role in self.allowed_roles)


class IsAdmin(HasRole):
    allowed_roles = (Role.ADMIN,)


class IsStaffMember(HasRole):
    """Any active role: the billing portal's baseline permission."""

    allowed_roles = (Role.ADMIN, Role.SENIOR_CASHIER, Role.CASHIER)
