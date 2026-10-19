from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator
from django.db import models

# Rates are stored in basis points (500 = 5.00%) and money in integer paise.
MAX_RATE_BP = 10_000


class TaxRule(models.Model):
    """A GST rule. Either a flat rate, or a rate that depends on each unit's taxable value."""

    class Kind(models.TextChoices):
        FLAT = "flat", "Flat rate"
        PRICE_BAND = "price_band", "Price band"

    name = models.CharField(max_length=80, unique=True)
    kind = models.CharField(max_length=12, choices=Kind.choices, default=Kind.FLAT)
    flat_rate_bp = models.PositiveIntegerField(null=True, blank=True, validators=[MaxValueValidator(MAX_RATE_BP)])
    # PRICE_BAND: units with taxable value <= threshold use the lower rate, others the upper rate.
    threshold_paise = models.PositiveBigIntegerField(null=True, blank=True)
    lower_rate_bp = models.PositiveIntegerField(null=True, blank=True, validators=[MaxValueValidator(MAX_RATE_BP)])
    upper_rate_bp = models.PositiveIntegerField(null=True, blank=True, validators=[MaxValueValidator(MAX_RATE_BP)])

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name

    def clean(self):
        if self.kind == self.Kind.FLAT and self.flat_rate_bp is None:
            raise ValidationError({"flat_rate_bp": "A flat rule needs a rate."})
        if self.kind == self.Kind.PRICE_BAND and None in (self.threshold_paise, self.lower_rate_bp, self.upper_rate_bp):
            raise ValidationError("A price-band rule needs a threshold and both rates.")

    def rate_bp_for(self, unit_taxable_paise: int) -> int:
        """GST rate for one unit, tested against its taxable value *after* discount."""
        if self.kind == self.Kind.FLAT:
            return self.flat_rate_bp or 0
        return self.lower_rate_bp if unit_taxable_paise <= self.threshold_paise else self.upper_rate_bp


class Category(models.Model):
    name = models.CharField(max_length=60, unique=True)
    slug = models.SlugField(max_length=60, unique=True)
    sort_order = models.PositiveSmallIntegerField(default=0)
    hsn_code = models.CharField("HSN code", max_length=8)
    tax_rule = models.ForeignKey(TaxRule, on_delete=models.PROTECT, related_name="categories")

    class Meta:
        ordering = ["sort_order", "name"]
        verbose_name_plural = "categories"

    def __str__(self) -> str:
        return self.name


class Product(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        ARCHIVED = "archived", "Archived"

    name = models.CharField(max_length=120)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="products")
    description = models.TextField(blank=True)
    base_price_paise = models.PositiveBigIntegerField()
    cost_price_paise = models.PositiveBigIntegerField(null=True, blank=True)
    # Optional overrides of the category's HSN code and tax rule.
    hsn_code = models.CharField("HSN code", max_length=8, blank=True)
    tax_rule = models.ForeignKey(TaxRule, on_delete=models.PROTECT, null=True, blank=True, related_name="products")
    image = models.ImageField(upload_to="products/", blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name

    @property
    def effective_hsn_code(self) -> str:
        return self.hsn_code or self.category.hsn_code

    @property
    def effective_tax_rule(self) -> TaxRule:
        return self.tax_rule or self.category.tax_rule


class Variant(models.Model):
    """The sellable, stock-tracked unit: one size/colour combination of a product."""

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="variants")
    size = models.CharField(max_length=20)
    colour = models.CharField(max_length=30)
    sku = models.CharField("SKU", max_length=40, unique=True)
    barcode = models.CharField(max_length=32, unique=True, null=True, blank=True)
    price_override_paise = models.PositiveBigIntegerField(null=True, blank=True)
    # Maintained only by apps.inventory.services.record_movement — never edit directly.
    on_hand = models.IntegerField(default=0, editable=False)
    reorder_level = models.PositiveIntegerField(default=2)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["product__name", "id"]
        constraints = [
            models.UniqueConstraint(fields=["product", "size", "colour"], name="unique_variant_options"),
            models.CheckConstraint(condition=models.Q(on_hand__gte=0), name="variant_on_hand_non_negative"),
        ]

    def __str__(self) -> str:
        return f"{self.product.name} · {self.size} / {self.colour}"

    @property
    def price_paise(self) -> int:
        return self.price_override_paise if self.price_override_paise is not None else self.product.base_price_paise

    @property
    def stock_state(self) -> str:
        if self.on_hand <= 0:
            return "out_of_stock"
        return "low_stock" if self.on_hand <= self.reorder_level else "in_stock"
