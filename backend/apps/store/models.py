from django.core.validators import MaxValueValidator
from django.db import models


class StoreSettings(models.Model):
    """Single-row store configuration. Printed on receipts; changes never alter past invoices."""

    name = models.CharField(max_length=120, default="Loom & Linen")
    code = models.CharField(max_length=20, default="LL-KKD-01")
    address = models.TextField(default="Beach Road, Kozhikode, Kerala")
    state = models.CharField(max_length=60, default="Kerala")
    gstin = models.CharField("GSTIN", max_length=15, blank=True)
    # False: catalogue prices exclude GST and tax is added at checkout (the prototype's behaviour).
    # True: catalogue prices are tax-inclusive MRP and GST is extracted from them.
    prices_include_tax = models.BooleanField(default=False)
    # A cashier may discount up to this % of the bill subtotal; above it needs a
    # Senior cashier/Admin approval PIN.
    cashier_discount_limit_pct = models.PositiveSmallIntegerField(default=10, validators=[MaxValueValidator(100)])

    class Meta:
        verbose_name = "store settings"
        verbose_name_plural = "store settings"

    def __str__(self) -> str:
        return self.name

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls) -> "StoreSettings":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
