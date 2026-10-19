from django.db import models


class Supplier(models.Model):
    """Supplier contact record. The balance due is derived from purchase and payment
    entries (added in Phase 6) and is deliberately not a field here."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        INACTIVE = "inactive", "Inactive"

    name = models.CharField(max_length=120, unique=True)
    category = models.CharField(max_length=60)
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name
