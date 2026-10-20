from django.urls import path

from . import views

urlpatterns = [
    path("", views.SupplierListCreateView.as_view(), name="suppliers"),
    path("categories/", views.SupplierCategoryListView.as_view(), name="supplier-categories"),
    path("<int:pk>/", views.SupplierDetailView.as_view(), name="supplier"),
    path("<int:pk>/purchases/", views.SupplierPurchaseListView.as_view(), name="supplier-purchases"),
    path("<int:pk>/payments/", views.SupplierPaymentListView.as_view(), name="supplier-payments"),
    path("<int:pk>/statement/", views.SupplierStatementView.as_view(), name="supplier-statement"),
    path("purchases/quote/", views.PurchaseQuoteView.as_view(), name="purchase-quote"),
    path("purchases/<str:number>/", views.PurchaseDetailView.as_view(), name="purchase"),
    path("purchases/<str:number>/receive/", views.PurchaseReceiveView.as_view(), name="purchase-receive"),
    path("purchases/<str:number>/cancel/", views.PurchaseCancelView.as_view(), name="purchase-cancel"),
]
