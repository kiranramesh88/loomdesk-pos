from django.conf import settings
from django.db import models


class StockMovement(models.Model):
    """Append-only record of every stock change. Variant.on_hand is the running total of these."""

    class Type(models.TextChoices):
        OPENING = "opening", "Opening stock"
        PURCHASE = "purchase", "Purchase received"
        SALE = "sale", "Sale"
        RETURN = "return", "Customer return"
        ADJUST_ADD = "adjust_add", "Adjustment (add)"
        ADJUST_REMOVE = "adjust_remove", "Adjustment (remove)"
        COUNT = "count", "Stock count"

    variant = models.ForeignKey("catalog.Variant", on_delete=models.PROTECT, related_name="movements")
    type = models.CharField(max_length=16, choices=Type.choices)
    quantity_delta = models.IntegerField()
    balance_after = models.IntegerField()
    reason = models.CharField(max_length=200, blank=True)
    # Free-form link to the source document, e.g. "LD-00842" or "RT-00128".
    reference = models.CharField(max_length=40, blank=True)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["variant", "-created_at"])]

    def __str__(self) -> str:
        return f"{self.get_type_display()} {self.quantity_delta:+d} · {self.variant}"
