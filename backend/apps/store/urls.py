from django.urls import path

from .views import StoreSettingsView, StoreView

urlpatterns = [
    path("", StoreView.as_view(), name="store"),
    path("settings/", StoreSettingsView.as_view(), name="store-settings"),
]
