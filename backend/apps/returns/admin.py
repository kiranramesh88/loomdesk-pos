from django.contrib import admin

from .models import Return


@admin.register(Return)
class ReturnAdmin(admin.ModelAdmin):
    list_display = ["number", "sale", "created_at", "reason", "total_paise", "created_by_name"]
    search_fields = ["number", "sale__invoice_no"]

    # Returns and refunds are financial records: read-only here, written only by services.create_return.
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
