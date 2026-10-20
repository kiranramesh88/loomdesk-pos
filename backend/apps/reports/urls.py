from django.urls import path

from . import views

urlpatterns = [
    path("", views.ReportListView.as_view(), name="reports"),
    path("<slug:key>/", views.ReportView.as_view(), name="report"),
    path("<slug:key>/export/", views.ReportExportView.as_view(), name="report-export"),
]
