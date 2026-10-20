from django.contrib.auth.base_user import BaseUserManager
from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.models import AbstractUser
from django.db import models


class Role(models.TextChoices):
    ADMIN = "admin", "Admin"
    SENIOR_CASHIER = "senior_cashier", "Senior cashier"
    CASHIER = "cashier", "Cashier"


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra):
        if not email:
            raise ValueError("An email address is required.")
        user = self.model(email=self.normalize_email(email).lower(), **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra):
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra)

    def create_superuser(self, email, password=None, **extra):
        extra.update(is_staff=True, is_superuser=True, role=Role.ADMIN)
        return self._create_user(email, password, **extra)


class User(AbstractUser):
    """A store staff account. Logs in with email; `role` drives every permission check."""

    username = None
    email = models.EmailField("email address", unique=True)
    full_name = models.CharField(max_length=120)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.CASHIER)
    # Hashed 4–6 digit PIN a Senior cashier/Admin enters at the till to approve a
    # discount above the cashier limit. Never returned by the API.
    approval_pin_hash = models.CharField(max_length=128, blank=True)
    # When the newest set-password link was issued. It's part of the link's token, so issuing another
    # link or using this one (which clears it) makes every earlier link stop working.
    setup_link_issued_at = models.DateTimeField(null=True, blank=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["full_name"]

    objects = UserManager()

    class Meta:
        ordering = ["full_name"]

    def __str__(self) -> str:
        return f"{self.full_name} <{self.email}>"

    @property
    def initials(self) -> str:
        parts = [p for p in self.full_name.replace(".", " ").split() if p]
        return "".join(p[0] for p in parts[:2]).upper() or self.email[:2].upper()

    @property
    def can_access_admin(self) -> bool:
        return self.role == Role.ADMIN

    @property
    def can_approve_discounts(self) -> bool:
        return self.role in (Role.ADMIN, Role.SENIOR_CASHIER)

    @property
    def can_view_costs(self) -> bool:
        return self.role == Role.ADMIN

    def set_approval_pin(self, pin: str) -> None:
        if not (pin.isdigit() and 4 <= len(pin) <= 6):
            raise ValueError("Approval PIN must be 4–6 digits.")
        self.approval_pin_hash = make_password(pin)

    def check_approval_pin(self, pin: str) -> bool:
        return bool(self.approval_pin_hash) and check_password(pin, self.approval_pin_hash)


class AttemptGuard(models.Model):
    """Counts guarded attempts (approval PINs, Django admin sign-ins) under a row lock; see `attempts.py`.

    `key` names what is guarded, e.g. `approval-pin:12`. Account keys hold a hash, never the email.
    """

    key = models.CharField(max_length=120, primary_key=True)
    attempts = models.PositiveIntegerField(default=0)
    last_attempt_at = models.DateTimeField(null=True, db_index=True)

    def __str__(self) -> str:
        return f"{self.key}: {self.attempts}"
