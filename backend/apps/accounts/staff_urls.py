from django.urls import path

from .staff_views import (
    StaffDeactivateView,
    StaffDetailView,
    StaffListView,
    StaffPinView,
    StaffReactivateView,
    StaffSetupLinkView,
)

urlpatterns = [
    path("", StaffListView.as_view(), name="staff-list"),
    path("<int:pk>/", StaffDetailView.as_view(), name="staff-detail"),
    path("<int:pk>/deactivate/", StaffDeactivateView.as_view(), name="staff-deactivate"),
    path("<int:pk>/reactivate/", StaffReactivateView.as_view(), name="staff-reactivate"),
    path("<int:pk>/pin/", StaffPinView.as_view(), name="staff-pin"),
    path("<int:pk>/setup-link/", StaffSetupLinkView.as_view(), name="staff-setup-link"),
]
