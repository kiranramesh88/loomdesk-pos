from django.conf import settings
from django.db import models
from django.db.models.functions import Lower


class Supplier(models.Model):
    """Supplier contact record. The balance due is derived from received purchases and recorded
    payments, and is deliberately not a field here (plan decision B10)."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        INACTIVE = "inactive", "Inactive"

    name = models.CharField(max_length=120, unique=True)
    category = models.CharField(max_length=60)
    contact_name = models.CharField(max_length=120, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    gstin = models.CharField("GSTIN", max_length=15, blank=True)
    address = models.TextField(blank=True)
    state = models.CharField(max_length=60, blank=True)
    notes = models.TextField(blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Purchase(models.Model):
    """Goods bought from a supplier, as on the supplier's invoice.

    Recording a purchase changes no stock. Receiving it adds every line to stock through
    record_movement(), once, in one transaction. Received purchases are never edited.
    """

    class Status(models.TextChoices):
        ORDERED = "ordered", "Awaiting goods"
        RECEIVED = "received", "Received"
        CANCELLED = "cancelled", "Cancelled"

    number = models.CharField(max_length=20, unique=True, blank=True)
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name="purchases")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ORDERED)
    supplier_invoice_no = models.CharField(max_length=40, blank=True)
    purchase_date = models.DateField()
    notes = models.TextField(blank=True)

    # Totals are computed on the server from the lines (services.price_lines) and stored.
    subtotal_paise = models.PositiveBigIntegerField()
    tax_paise = models.PositiveBigIntegerField()
    total_paise = models.PositiveBigIntegerField()

    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    # A retried "record purchase" with the same key returns this purchase instead of adding another.
    idempotency_key = models.UUIDField()
    request_hash = models.CharField(max_length=64)

    received_at = models.DateTimeField(null=True, blank=True)
    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    cancel_reason = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["-purchase_date", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["created_by", "idempotency_key"], name="unique_purchase_request"),
            # One supplier invoice is recorded once (cancelled entries free the number again).
            models.UniqueConstraint(
                Lower("supplier_invoice_no"),
                "supplier",
                condition=~models.Q(supplier_invoice_no="") & ~models.Q(status="cancelled"),
                name="unique_supplier_invoice",
            ),
        ]

    def __str__(self) -> str:
        return self.number


class PurchaseLine(models.Model):
    """One variant on a purchase, with the item names as they were when recorded."""

    purchase = models.ForeignKey(Purchase, on_delete=models.CASCADE, related_name="lines")
    variant = models.ForeignKey("catalog.Variant", on_delete=models.PROTECT, related_name="purchase_lines")
    product_name = models.CharField(max_length=120)
    variant_sku = models.CharField(max_length=40)
    size = models.CharField(max_length=20)
    colour = models.CharField(max_length=30)
    quantity = models.PositiveIntegerField()
    unit_cost_paise = models.PositiveBigIntegerField()
    tax_rate_bp = models.PositiveIntegerField()
    subtotal_paise = models.PositiveBigIntegerField()
    tax_paise = models.PositiveBigIntegerField()
    total_paise = models.PositiveBigIntegerField()

    class Meta:
        ordering = ["id"]
        constraints = [models.UniqueConstraint(fields=["purchase", "variant"], name="one_line_per_variant")]


class SupplierPayment(models.Model):
    """A payment to a supplier, entered by staff. Not verified against any bank or gateway."""

    class Method(models.TextChoices):
        BANK_TRANSFER = "bank_transfer", "Bank transfer"
        UPI = "upi", "UPI"
        CHEQUE = "cheque", "Cheque"
        CASH = "cash", "Cash"

    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name="payments")
    paid_on = models.DateField()
    amount_paise = models.PositiveBigIntegerField()
    method = models.CharField(max_length=16, choices=Method.choices)
    reference = models.CharField(max_length=60, blank=True)
    notes = models.CharField(max_length=200, blank=True)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    idempotency_key = models.UUIDField()
    request_hash = models.CharField(max_length=64)

    class Meta:
        ordering = ["-paid_on", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["recorded_by", "idempotency_key"], name="unique_payment_request"),
            models.CheckConstraint(condition=models.Q(amount_paise__gt=0), name="payment_amount_positive"),
        ]
