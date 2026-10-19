import pytest
from django.core.exceptions import ValidationError

from apps.catalog.models import TaxRule

GARMENTS = TaxRule(kind=TaxRule.Kind.PRICE_BAND, threshold_paise=2_500_00, lower_rate_bp=500, upper_rate_bp=1800)


@pytest.mark.parametrize(
    "unit_taxable_paise,expected_bp",
    [(449_00, 500), (2_500_00, 500), (2_500_01, 1800), (2_700_00, 1800)],
)
def test_price_band_uses_unit_taxable_value(unit_taxable_paise, expected_bp):
    assert GARMENTS.rate_bp_for(unit_taxable_paise) == expected_bp


def test_flat_rule():
    assert TaxRule(kind=TaxRule.Kind.FLAT, flat_rate_bp=1800).rate_bp_for(10_000_00) == 1800


def test_incomplete_rules_fail_validation():
    with pytest.raises(ValidationError):
        TaxRule(name="x", kind=TaxRule.Kind.FLAT).clean()
    with pytest.raises(ValidationError):
        TaxRule(name="y", kind=TaxRule.Kind.PRICE_BAND, lower_rate_bp=500).clean()
