from django.urls import path

from .views import (
    ApproverListView,
    BillingCategoryListView,
    BillingSettingsView,
    QuoteView,
    SaleCashierListView,
    SaleDetailView,
    SaleListCreateView,
    SalesSummaryView,
    SellableProductListView,
)

billing_urlpatterns = [
    path("settings/", BillingSettingsView.as_view(), name="billing-settings"),
    path("products/", SellableProductListView.as_view(), name="billing-products"),
    path("categories/", BillingCategoryListView.as_view(), name="billing-categories"),
    path("approvers/", ApproverListView.as_view(), name="billing-approvers"),
]

sales_urlpatterns = [
    path("", SaleListCreateView.as_view(), name="sale-list"),
    path("quote/", QuoteView.as_view(), name="sale-quote"),
    path("summary/", SalesSummaryView.as_view(), name="sale-summary"),
    path("cashiers/", SaleCashierListView.as_view(), name="sale-cashiers"),
    path("<str:invoice_no>/", SaleDetailView.as_view(), name="sale-detail"),
]
