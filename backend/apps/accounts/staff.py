"""Staff accounts: adding people, roles, approval PINs, deactivation and one-time set-password links.

Every change runs under a row lock on the active admin accounts, taken before the account being changed,
so two admins acting at once can't leave the store without an admin or act after losing the role.
Passwords, PINs and links never reach the audit log; the admin never sees or sets a password (D5).
"""

import os
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.http import Http404
from django.utils import timezone
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import status
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError

from apps.audit import services as audit
from apps.audit.models import AuditEntry

from . import attempts
from .models import Role, User

# Published demo passwords: a real account must not use them (matches create_staff).
DEMO_PASSWORDS = {"loomdesk-demo"}


class Conflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "conflict"


class SelfChange(Conflict):
    default_code = "self_change"


class LastAdmin(Conflict):
    default_code = "last_admin"
    default_detail = "The store needs at least one active admin. Make someone else an admin first."


class InactiveAccount(Conflict):
    default_code = "inactive_account"


class InvalidLink(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "invalid_link"
    default_detail = "This link has expired or was already used. Ask a store admin for a new one."


class SetupTokenGenerator(PasswordResetTokenGenerator):
    """Django's signed, expiring token, bound to the newest link and the account's state.

    The hash covers the password hash (so a used link dies), the issue time (so a newer link replaces it),
    `is_active` and the email. Expiry is PASSWORD_RESET_TIMEOUT.
    """

    key_salt = "loomdesk.accounts.staff-setup"

    def _make_hash_value(self, user, timestamp):
        # The exact instant, microseconds included, so even two links issued in one second differ.
        issued = "" if user.setup_link_issued_at is None else f"{user.setup_link_issued_at.timestamp():.6f}"
        return f"{user.pk}{user.password}{issued}{user.is_active}{user.email}{timestamp}"


setup_tokens = SetupTokenGenerator()


def pin_key(user_id: int) -> str:
    # Shared with the till's approval-PIN check (apps.sales.services).
    return f"approval-pin:{user_id}"


def _lock(actor: User, target_id: int) -> tuple[User, set[int]]:
    """Lock the active admins, then the target. Returns the target and the active admin ids.

    The actor is checked again under the lock: a request that started while they were an admin must not
    go on after another admin demoted or deactivated them.
    """
    admins = set(
        User.objects.select_for_update().filter(role=Role.ADMIN, is_active=True).order_by("pk").values_list("pk", flat=True)
    )
    if actor.pk not in admins:
        raise PermissionDenied("Only an active admin can manage staff.")
    try:
        target = User.objects.select_for_update().get(pk=target_id)
    except User.DoesNotExist as exc:
        raise Http404 from exc
    return target, admins


def _would_remove_last_admin(target: User, admins: set[int]) -> bool:
    return target.pk in admins and len(admins) == 1


def _issue_link(target: User) -> dict:
    target.setup_link_issued_at = timezone.now()
    target.save(update_fields=["setup_link_issued_at"])
    uid = urlsafe_base64_encode(force_bytes(target.pk))
    token = setup_tokens.make_token(target)
    return {
        "path": f"/set-password/{uid}/{token}",
        "expires_at": target.setup_link_issued_at + timedelta(seconds=settings.PASSWORD_RESET_TIMEOUT),
    }


def _role_label(role: str) -> str:
    return Role(role).label


@transaction.atomic
def create_staff(actor: User, *, email: str, full_name: str, role: str) -> tuple[User, dict]:
    """Add an account with no usable password and return it with its first set-password link."""
    _lock(actor, actor.pk)
    email = User.objects.normalize_email(email.strip()).lower()
    if User.objects.filter(email__iexact=email).exists():
        raise ValidationError({"email": ["An account with this email already exists."]})
    user = User(email=email, full_name=full_name.strip(), role=role)
    user.set_unusable_password()
    user.save()
    link = _issue_link(user)
    audit.record(
        actor,
        AuditEntry.Action.STAFF_CREATE,
        email,
        f"Added {user.full_name} as {_role_label(role)}",
        user_id=user.pk,
        role=role,
    )
    audit.record(actor, AuditEntry.Action.STAFF_SETUP_LINK, email, f"Issued a set-password link for {user.full_name}", user_id=user.pk)
    return user, link


@transaction.atomic
def update_staff(actor: User, user_id: int, *, full_name=None, email=None, role=None) -> User:
    target, admins = _lock(actor, user_id)
    changes: dict[str, list] = {}
    if full_name is not None and full_name.strip() != target.full_name:
        changes["full_name"] = [target.full_name, full_name.strip()]
        target.full_name = full_name.strip()
    if email is not None:
        email = User.objects.normalize_email(email.strip()).lower()
        if email != target.email:
            if User.objects.filter(email__iexact=email).exclude(pk=target.pk).exists():
                raise ValidationError({"email": ["An account with this email already exists."]})
            changes["email"] = [target.email, email]
            target.email = email
    pin_cleared = False
    if role is not None and role != target.role:
        if target.pk == actor.pk:
            raise SelfChange("You can’t change your own role. Ask another admin.")
        if role != Role.ADMIN and _would_remove_last_admin(target, admins):
            raise LastAdmin()
        changes["role"] = [target.role, role]
        target.role = role
        if role != Role.ADMIN:
            # The role is the only route into the admin; Django's own admin flags follow it down.
            target.is_staff = False
            target.is_superuser = False
        if role == Role.CASHIER and target.approval_pin_hash:
            # Cashiers can't approve discounts, so a PIN would only be a secret lying around.
            target.approval_pin_hash = ""
            pin_cleared = True
    if not changes:
        return target
    target.save()
    parts = []
    if "role" in changes:
        parts.append(f"role {_role_label(changes['role'][0])} → {_role_label(changes['role'][1])}")
    if "full_name" in changes:
        parts.append("name")
    if "email" in changes:
        parts.append("email")
    audit.record(
        actor,
        AuditEntry.Action.STAFF_UPDATE,
        target.email,
        f"Changed {target.full_name}: {', '.join(parts)}" + ("; approval PIN removed" if pin_cleared else ""),
        user_id=target.pk,
        changes=changes,
        pin_cleared=pin_cleared,
    )
    return target


@transaction.atomic
def set_active(actor: User, user_id: int, active: bool) -> User:
    target, admins = _lock(actor, user_id)
    if target.is_active == active:
        return target
    if not active:
        if target.pk == actor.pk:
            raise SelfChange("You can’t deactivate your own account. Ask another admin.")
        if _would_remove_last_admin(target, admins):
            raise LastAdmin()
    target.is_active = active
    target.save(update_fields=["is_active"])
    audit.record(
        actor,
        AuditEntry.Action.STAFF_REACTIVATE if active else AuditEntry.Action.STAFF_DEACTIVATE,
        target.email,
        f"{'Reactivated' if active else 'Deactivated'} {target.full_name}",
        user_id=target.pk,
    )
    return target


@transaction.atomic
def set_pin(actor: User, user_id: int, pin: str) -> User:
    target, _ = _lock(actor, user_id)
    if not target.can_approve_discounts:
        raise ValidationError({"pin": ["Cashiers can’t approve discounts, so they don’t have a PIN."]})
    if not target.is_active:
        raise InactiveAccount("Reactivate this account before setting its PIN.")
    had_pin = bool(target.approval_pin_hash)
    try:
        target.set_approval_pin(pin)
    except ValueError as exc:
        raise ValidationError({"pin": [str(exc)]}) from exc
    target.save(update_fields=["approval_pin_hash"])
    # A new PIN starts with a clean slate at the till.
    attempts.clear(pin_key(target.pk))
    audit.record(
        actor,
        AuditEntry.Action.STAFF_PIN_SET,
        target.email,
        f"{'Changed' if had_pin else 'Set'} the approval PIN for {target.full_name}",
        user_id=target.pk,
    )
    return target


@transaction.atomic
def clear_pin(actor: User, user_id: int) -> User:
    target, _ = _lock(actor, user_id)
    if not target.approval_pin_hash:
        return target
    target.approval_pin_hash = ""
    target.save(update_fields=["approval_pin_hash"])
    audit.record(actor, AuditEntry.Action.STAFF_PIN_CLEAR, target.email, f"Removed the approval PIN for {target.full_name}", user_id=target.pk)
    return target


@transaction.atomic
def issue_setup_link(actor: User, user_id: int) -> dict:
    """A fresh link for a new account or a forgotten password. Any earlier link stops working."""
    target, _ = _lock(actor, user_id)
    if not target.is_active:
        raise InactiveAccount("Reactivate this account before issuing a set-password link.")
    link = _issue_link(target)
    audit.record(actor, AuditEntry.Action.STAFF_SETUP_LINK, target.email, f"Issued a set-password link for {target.full_name}", user_id=target.pk)
    return link


def user_for_link(uidb64: str, token: str) -> User:
    """The account a set-password link belongs to, or InvalidLink: expired, used, replaced or inactive."""
    try:
        user = User.objects.get(pk=int(force_str(urlsafe_base64_decode(uidb64))))
    except (ValueError, TypeError, OverflowError, User.DoesNotExist) as exc:
        raise InvalidLink() from exc
    if not user.is_active or user.setup_link_issued_at is None or not setup_tokens.check_token(user, token):
        raise InvalidLink()
    return user


@transaction.atomic
def set_password_from_link(uidb64: str, token: str, password: str) -> User:
    user = user_for_link(uidb64, token)
    user = User.objects.select_for_update().get(pk=user.pk)
    # Checked again under the lock, so two submissions of one link can't both set a password.
    if user.setup_link_issued_at is None or not setup_tokens.check_token(user, token):
        raise InvalidLink()
    if password in DEMO_PASSWORDS or password == os.environ.get("SEED_DEMO_PASSWORD"):
        raise ValidationError({"password": ["That’s the published demo password. Choose one of your own."]})
    try:
        validate_password(password, user)
    except DjangoValidationError as exc:
        raise ValidationError({"password": list(exc.messages)}) from exc
    user.set_password(password)
    user.setup_link_issued_at = None
    user.save(update_fields=["password", "setup_link_issued_at"])
    audit.record(user, AuditEntry.Action.STAFF_PASSWORD_SET, user.email, f"{user.full_name} set a password from a link", user_id=user.pk)
    return user
