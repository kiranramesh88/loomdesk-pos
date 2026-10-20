"""Bill maths: the single place prices, discounts and GST are calculated (plan §8.1).

Order of operations, per line:
1. line subtotal = unit price × quantity (catalogue price, read from the database);
2. the bill discount is shared across lines in proportion to their subtotals, and any paise
   left over from rounding go to the largest line;
3. the line's taxable value and GST follow from what remains, with the GST slab chosen from
   the value of ONE unit after its share of the discount.

Money is integer paise throughout. Divisions go through Decimal and round half-up to whole paise.

Prices are tax-exclusive by default (StoreSettings.prices_include_tax = False): GST is added on
top. When the setting is on, catalogue prices are tax-inclusive and GST is extracted from them.
"""

from dataclasses import dataclass
from decimal import ROUND_FLOOR, ROUND_HALF_UP, Decimal

from apps.catalog.models import TaxRule, Variant

BP = Decimal(10_000)  # basis points in 100%


def round_paise(value: Decimal) -> int:
    return int(value.quantize(Decimal(1), rounding=ROUND_HALF_UP))


def allocate(total: int, weights: list[int]) -> list[int]:
    """Split `total` paise in proportion to `weights`; the rounding remainder goes to the largest weight."""
    whole = sum(weights)
    if not total or not whole:
        return [0] * len(weights)
    shares = [int((Decimal(total) * w / whole).to_integral_value(rounding=ROUND_FLOOR)) for w in weights]
    largest = max(range(len(weights)), key=lambda i: (weights[i], -i))
    shares[largest] += total - sum(shares)
    return shares


def rate_for(rule: TaxRule, unit_value: Decimal, prices_include_tax: bool) -> int:
    """GST rate for one unit worth `unit_value` paise after discount.

    The slab is tested against the unit's taxable value. With tax-inclusive prices that value
    isn't known until the rate is, so the lower rate is tried first: if the unit's taxable value
    at the lower rate is within the threshold, the lower rate applies; otherwise the upper one.
    """
    if not prices_include_tax or rule.kind == TaxRule.Kind.FLAT:
        return rule.rate_bp_for(unit_value)
    return rule.rate_bp_for(unit_value * BP / (BP + rule.lower_rate_bp))


@dataclass(frozen=True)
class PricedLine:
    variant: Variant
    quantity: int
    unit_price_paise: int
    subtotal_paise: int
    discount_paise: int
    taxable_paise: int
    tax_rate_bp: int
    tax_paise: int
    total_paise: int


@dataclass(frozen=True)
class PricedBill:
    lines: list[PricedLine]
    prices_include_tax: bool
    subtotal_paise: int
    discount_paise: int
    taxable_paise: int
    tax_paise: int
    total_paise: int


def price_bill(items: list[tuple[Variant, int]], discount_paise: int, prices_include_tax: bool) -> PricedBill:
    """Price (variant, quantity) pairs. Variants must come with product__category__tax_rule loaded."""
    subtotals = [variant.price_paise * quantity for variant, quantity in items]
    subtotal = sum(subtotals)
    if not 0 <= discount_paise <= subtotal:
        raise ValueError("The discount must be between ₹0 and the bill subtotal.")

    lines = []
    for (variant, quantity), line_subtotal, share in zip(items, subtotals, allocate(discount_paise, subtotals)):
        after_discount = line_subtotal - share
        rule = variant.product.effective_tax_rule
        rate = rate_for(rule, Decimal(after_discount) / quantity, prices_include_tax)
        if prices_include_tax:
            taxable = round_paise(Decimal(after_discount) * BP / (BP + rate))
            tax = after_discount - taxable
        else:
            taxable = after_discount
            tax = round_paise(Decimal(taxable) * rate / BP)
        lines.append(
            PricedLine(
                variant=variant,
                quantity=quantity,
                unit_price_paise=variant.price_paise,
                subtotal_paise=line_subtotal,
                discount_paise=share,
                taxable_paise=taxable,
                tax_rate_bp=rate,
                tax_paise=tax,
                total_paise=taxable + tax,
            )
        )

    return PricedBill(
        lines=lines,
        prices_include_tax=prices_include_tax,
        subtotal_paise=subtotal,
        discount_paise=discount_paise,
        taxable_paise=sum(line.taxable_paise for line in lines),
        tax_paise=sum(line.tax_paise for line in lines),
        total_paise=sum(line.total_paise for line in lines),
    )


def tax_breakdown(lines) -> list[dict]:
    """GST per rate, split equally into CGST and SGST (intra-state sales; the odd paisa goes to SGST).

    Works on PricedLine or saved SaleLine objects alike, so receipts are built from saved data.
    """
    groups: dict[int, dict] = {}
    for line in lines:
        group = groups.setdefault(line.tax_rate_bp, {"rate_bp": line.tax_rate_bp, "taxable_paise": 0, "tax_paise": 0})
        group["taxable_paise"] += line.taxable_paise
        group["tax_paise"] += line.tax_paise
    rows = []
    for rate_bp in sorted(groups):
        group = groups[rate_bp]
        cgst = group["tax_paise"] // 2
        rows.append({**group, "cgst_paise": cgst, "sgst_paise": group["tax_paise"] - cgst})
    return rows
