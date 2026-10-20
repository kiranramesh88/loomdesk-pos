from django.contrib import admin

from .models import Payment, Sale, SaleLine


class ReadOnlyInline(admin.TabularInline):
    extra = 0
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False


class SaleLineInline(ReadOnlyInline):
    model = SaleLine


class PaymentInline(ReadOnlyInline):
    model = Payment


@admin.register(Sale)
class SaleAdmin(admin.ModelAdmin):
    """Read-only: completed sales are never edited (returns and voids come later, as separate records)."""

    list_display = ["invoice_no", "created_at", "cashier_name", "total_paise"]
    search_fields = ["invoice_no", "cashier_name"]
    inlines = [SaleLineInline, PaymentInline]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
