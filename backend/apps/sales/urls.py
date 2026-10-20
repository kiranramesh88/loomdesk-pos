from django.urls import path

from .views import (
    ApproverListView,
    BillingCategoryListView,
    BillingSettingsView,
    QuoteView,
    SaleCreateView,
    SaleDetailView,
    SellableProductListView,
)

billing_urlpatterns = [
    path("settings/", BillingSettingsView.as_view(), name="billing-settings"),
    path("products/", SellableProductListView.as_view(), name="billing-products"),
    path("categories/", BillingCategoryListView.as_view(), name="billing-categories"),
    path("approvers/", ApproverListView.as_view(), name="billing-approvers"),
]

sales_urlpatterns = [
    path("", SaleCreateView.as_view(), name="sale-create"),
    path("quote/", QuoteView.as_view(), name="sale-quote"),
    path("<str:invoice_no>/", SaleDetailView.as_view(), name="sale-detail"),
]
