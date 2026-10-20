from django.conf import settings
from django.db import models

from apps.sales.models import Payment, Sale, SaleLine


class Return(models.Model):
    """Goods a customer brought back from one sale, and the money given back for them (`refund`).

    A separate record: the sale itself never changes. Every figure is worked out by
    `services.create_return` from the sale line's saved values (price, its share of the bill discount,
    tax), never from today's catalogue.
    """

    class Reason(models.TextChoices):
        SIZE_FIT = "size_fit", "Size or fit"
        DEFECT = "defect", "Damaged or defective"
        NOT_AS_EXPECTED = "not_as_expected", "Not as expected"
        WRONG_ITEM = "wrong_item", "Wrong item"
        OTHER = "other", "Other"

    number = models.CharField(max_length=20, unique=True)
    sale = models.ForeignKey(Sale, on_delete=models.PROTECT, related_name="returns")
    reason = models.CharField(max_length=20, choices=Reason.choices)
    note = models.CharField(max_length=200, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    created_by_name = models.CharField(max_length=120)
    created_at = models.DateTimeField(auto_now_add=True)

    # A retried request with the same key returns this return instead of refunding twice.
    idempotency_key = models.UUIDField()
    request_hash = models.CharField(max_length=64)

    subtotal_paise = models.PositiveBigIntegerField()
    discount_paise = models.PositiveBigIntegerField()
    taxable_paise = models.PositiveBigIntegerField()
    tax_paise = models.PositiveBigIntegerField()
    total_paise = models.PositiveBigIntegerField()

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["created_by", "idempotency_key"], name="unique_return_per_user_key"),
        ]

    def __str__(self) -> str:
        return self.number


class ReturnLine(models.Model):
    """Units of one sale line coming back, where they go, and their share of the refund."""

    class Disposition(models.TextChoices):
        SELLABLE = "sellable", "Back to stock"
        DAMAGED = "damaged", "Damaged"
        INSPECTION = "inspection", "Inspection hold"

    ret = models.ForeignKey(Return, on_delete=models.CASCADE, related_name="lines")
    sale_line = models.ForeignKey(SaleLine, on_delete=models.PROTECT, related_name="return_lines")
    quantity = models.PositiveIntegerField()
    disposition = models.CharField(max_length=12, choices=Disposition.choices)
    subtotal_paise = models.PositiveBigIntegerField()
    discount_paise = models.PositiveBigIntegerField()
    taxable_paise = models.PositiveBigIntegerField()
    tax_paise = models.PositiveBigIntegerField()
    total_paise = models.PositiveBigIntegerField()

    class Meta:
        ordering = ["id"]


class Refund(models.Model):
    """Money given back for a return, as recorded by staff. There's no payment gateway, so a UPI or
    card refund is what the staff member says they sent: `gateway_verified` is always False."""

    ret = models.OneToOneField(Return, on_delete=models.CASCADE, related_name="refund")
    method = models.CharField(max_length=8, choices=Payment.Method.choices)
    amount_paise = models.PositiveBigIntegerField()
    reference = models.CharField(max_length=40, blank=True)
    gateway_verified = models.BooleanField(default=False, editable=False)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    recorded_at = models.DateTimeField(auto_now_add=True)
