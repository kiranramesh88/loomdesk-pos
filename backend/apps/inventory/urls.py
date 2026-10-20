from django.urls import path

from .views import (
    InventorySummaryView,
    InventoryVariantDetailView,
    InventoryVariantListView,
    MovementListView,
    StockAdjustmentView,
)

urlpatterns = [
    path("summary/", InventorySummaryView.as_view(), name="inventory-summary"),
    path("variants/", InventoryVariantListView.as_view(), name="inventory-variants"),
    path("variants/<int:pk>/", InventoryVariantDetailView.as_view(), name="inventory-variant"),
    path("movements/", MovementListView.as_view(), name="inventory-movements"),
    path("adjustments/", StockAdjustmentView.as_view(), name="inventory-adjustments"),
]
