from django.contrib import admin

from .models import Supplier


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ["name", "category", "contact_name", "phone", "status"]
    list_filter = ["status", "category"]
    search_fields = ["name", "contact_name", "email", "phone", "gstin"]
