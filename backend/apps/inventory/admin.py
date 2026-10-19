from django.contrib import admin

from .models import StockMovement


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = ["created_at", "variant", "type", "quantity_delta", "balance_after", "reference", "actor"]
    list_filter = ["type"]
    search_fields = ["variant__sku", "reference"]

    # Movements are an audit trail: read-only here, created only via services.record_movement.
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
