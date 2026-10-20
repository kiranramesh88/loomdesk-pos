from django.conf import settings
from django.db import models


class InvoiceCounter(models.Model):
    """One row per series. Locked while a sale is written, so invoice numbers have no gaps:
    a sale that fails rolls its number back with it."""

    series = models.CharField(max_length=10, primary_key=True)
    last_number = models.PositiveIntegerField(default=0)


class Sale(models.Model):
    """A completed bill. Never edited after it's written: every figure a receipt shows is stored
    here or on its lines, so later catalogue or store changes can't alter it (CLAUDE.md, immutable sales)."""

    class Status(models.TextChoices):
        COMPLETED = "completed", "Completed"

    invoice_no = models.CharField(max_length=20, unique=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.COMPLETED)
    cashier = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="sales")
    cashier_name = models.CharField(max_length=120)
    created_at = models.DateTimeField(auto_now_add=True)

    # A retried checkout with the same key returns this sale instead of creating another.
    idempotency_key = models.UUIDField()
    # Fingerprint of the bill the key was first used for; reusing the key for a different bill is refused.
    request_hash = models.CharField(max_length=64)

    prices_include_tax = models.BooleanField()
    subtotal_paise = models.PositiveBigIntegerField()
    discount_paise = models.PositiveBigIntegerField(default=0)
    taxable_paise = models.PositiveBigIntegerField()
    tax_paise = models.PositiveBigIntegerField()
    total_paise = models.PositiveBigIntegerField()
    discount_approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )

    # Store details as printed on this receipt.
    store_name = models.CharField(max_length=120)
    store_code = models.CharField(max_length=20)
    store_address = models.TextField()
    store_state = models.CharField(max_length=60)
    store_gstin = models.CharField(max_length=15, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["cashier", "idempotency_key"], name="unique_checkout_per_cashier"),
        ]

    def __str__(self) -> str:
        return self.invoice_no


class SaleLine(models.Model):
    """One variant on a bill, with a snapshot of what was sold and how it was taxed."""

    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name="lines")
    variant = models.ForeignKey("catalog.Variant", on_delete=models.PROTECT, related_name="sale_lines")
    product_name = models.CharField(max_length=120)
    product_sku = models.CharField(max_length=40)
    variant_sku = models.CharField(max_length=40)
    size = models.CharField(max_length=20)
    colour = models.CharField(max_length=30)
    hsn_code = models.CharField(max_length=8, blank=True)
    quantity = models.PositiveIntegerField()
    unit_price_paise = models.PositiveBigIntegerField()
    subtotal_paise = models.PositiveBigIntegerField()
    discount_paise = models.PositiveBigIntegerField()
    taxable_paise = models.PositiveBigIntegerField()
    tax_rate_bp = models.PositiveIntegerField()
    tax_paise = models.PositiveBigIntegerField()
    total_paise = models.PositiveBigIntegerField()

    class Meta:
        ordering = ["id"]


class Payment(models.Model):
    """How the bill was paid. There's no payment gateway: the cashier records the method after
    taking cash or seeing a UPI/card confirmation, so `gateway_verified` is always False."""

    class Method(models.TextChoices):
        CASH = "cash", "Cash"
        UPI = "upi", "UPI"
        CARD = "card", "Card"

    # One payment per sale for now (no split tenders).
    sale = models.OneToOneField(Sale, on_delete=models.CASCADE, related_name="payment")
    method = models.CharField(max_length=8, choices=Method.choices)
    amount_paise = models.PositiveBigIntegerField()
    tendered_paise = models.PositiveBigIntegerField(null=True, blank=True)
    change_paise = models.PositiveBigIntegerField(default=0)
    # UPI transaction ID or card approval code, as read by the cashier.
    reference = models.CharField(max_length=40, blank=True)
    gateway_verified = models.BooleanField(default=False, editable=False)
    recorded_at = models.DateTimeField(auto_now_add=True)
