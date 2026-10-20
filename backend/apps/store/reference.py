"""Reference data every store needs before it can sell: GST rules and the categories that use them.

Shared by `seed_demo` (the demo store) and `setup_store` (a real store, with no demo products,
accounts or passwords).
"""

from django.utils.text import slugify

from apps.catalog.models import Category, TaxRule
from apps.store import seed_data


def ensure_reference_data() -> tuple[dict[str, TaxRule], dict[str, Category]]:
    """Create the default tax rules and categories that are missing. Existing rows are left as they are."""
    rules = {}
    for spec in seed_data.TAX_RULES:
        rule = TaxRule.objects.filter(name=spec["name"]).first()
        if rule is None:
            rule = TaxRule(**spec)
            rule.full_clean()
            rule.save()
        rules[rule.name] = rule

    categories = {}
    for order, (name, hsn, rule_name) in enumerate(seed_data.CATEGORIES):
        categories[name], _ = Category.objects.get_or_create(
            name=name,
            defaults={"slug": slugify(name), "sort_order": order, "hsn_code": hsn, "tax_rule": rules[rule_name]},
        )
    return rules, categories
