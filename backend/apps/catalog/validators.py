import re

from rest_framework import serializers

SKU_PATTERN = re.compile(r"^[A-Z0-9][A-Z0-9-]{1,39}$")
BARCODE_PATTERN = re.compile(r"^[0-9A-Z-]{4,32}$")
HSN_PATTERN = re.compile(r"^\d{4}(\d{2}){0,2}$")
GS1_LENGTHS = {8, 12, 13, 14}  # EAN-8, UPC-A, EAN-13, GTIN-14

# ₹1 crore per unit: anything above is a typo (an extra zero or paise entered as rupees).
MAX_PRICE_PAISE = 1_00_00_000_00


def gs1_check_digit_ok(code: str) -> bool:
    """GS1 mod-10 check: weights 3 and 1 alternate from the digit before the check digit."""
    *body, check = (int(d) for d in code)
    total = sum(d * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(body)))
    return (10 - total % 10) % 10 == check


class SkuField(serializers.CharField):
    """Stock-keeping code, normalised to upper case so "sh-ct-001" and "SH-CT-001" collide."""

    def __init__(self, **kwargs):
        kwargs.setdefault("max_length", 40)
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        value = super().to_internal_value(data).strip().upper()
        if not SKU_PATTERN.match(value):
            raise serializers.ValidationError("Use 2–40 letters, numbers and hyphens, e.g. SH-CT-001.")
        return value


class BarcodeField(serializers.CharField):
    """Optional scannable code. Blank becomes null; all-digit GS1 lengths must pass their check digit."""

    def __init__(self, **kwargs):
        kwargs.update(max_length=32, allow_null=True, allow_blank=True, required=False)
        super().__init__(**kwargs)

    def run_validation(self, data=serializers.empty):
        # CharField returns "" for blank input before to_internal_value runs; store null instead,
        # because barcode is unique and two blank strings would collide.
        value = super().run_validation(data)
        return value or None

    def to_internal_value(self, data):
        value = super().to_internal_value(data).strip().upper()
        if not value:
            return None
        if not BARCODE_PATTERN.match(value):
            raise serializers.ValidationError("Use 4–32 letters, numbers or hyphens.")
        if value.isdigit() and len(value) in GS1_LENGTHS and not gs1_check_digit_ok(value):
            raise serializers.ValidationError("The check digit doesn’t match. Rescan or retype the barcode.")
        return value


def validate_hsn(value: str) -> str:
    value = value.strip()
    if value and not HSN_PATTERN.match(value):
        raise serializers.ValidationError("HSN codes are 4, 6 or 8 digits.")
    return value
