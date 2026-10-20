from django.urls import path

from . import views

urlpatterns = [
    path("", views.ReturnListCreateView.as_view(), name="returns"),
    path("quote/", views.ReturnQuoteView.as_view(), name="return-quote"),
    path("invoice/<str:invoice_no>/", views.ReturnableSaleView.as_view(), name="returnable-sale"),
    path("<str:number>/", views.ReturnDetailView.as_view(), name="return"),
]
