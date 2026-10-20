from django.contrib import admin

from .models import AuditEntry


@admin.register(AuditEntry)
class AuditEntryAdmin(admin.ModelAdmin):
    list_display = ["created_at", "action", "target", "actor_name", "summary"]
    list_filter = ["action"]
    search_fields = ["target", "actor_name", "summary"]

    # Append-only: readable here, written only through apps.audit.services.record.
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
