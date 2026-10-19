from django.contrib import admin

from .models import Category, Product, TaxRule, Variant


@admin.register(TaxRule)
class TaxRuleAdmin(admin.ModelAdmin):
    list_display = ["name", "kind", "flat_rate_bp", "threshold_paise", "lower_rate_bp", "upper_rate_bp"]


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "hsn_code", "tax_rule", "sort_order"]
    prepopulated_fields = {"slug": ["name"]}


class VariantInline(admin.TabularInline):
    model = Variant
    extra = 0
    readonly_fields = ["on_hand"]


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ["name", "sku", "category", "base_price_paise", "status"]
    list_filter = ["category", "status"]
    search_fields = ["name", "sku", "variants__sku", "variants__barcode"]
    inlines = [VariantInline]
