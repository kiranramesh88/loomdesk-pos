from django.http import HttpResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin

from .exporting import filename, to_csv
from .period import parse_period
from .reports import REPORTS, run
from .serializers import ReportListItemSerializer, ReportSerializer

PARAMETERS = [
    OpenApiParameter("date_from", OpenApiTypes.DATE, description="First store date (default: 30 days before date_to)"),
    OpenApiParameter("date_to", OpenApiTypes.DATE, description="Last store date (default: today)"),
    OpenApiParameter("category", str, description="Sales by product, inventory valuation, low stock: a category id"),
    OpenApiParameter("state", str, description="Low stock: low_stock or out_of_stock"),
    OpenApiParameter("reason", str, description="Returns & refunds: a return reason"),
    OpenApiParameter("action", str, description="Activity log: an audit action"),
]


def _build(key: str, params) -> dict:
    report = REPORTS.get(key)
    if report is None:
        raise NotFound("There’s no such report.")
    period = parse_period(params) if report.uses_dates else None
    return run(report, period, params)


class ReportListView(APIView):
    """The reports that exist. All are admin-only: they show cost prices, staff figures and refunds."""

    permission_classes = [IsAdmin]

    @extend_schema(responses=ReportListItemSerializer(many=True))
    def get(self, request):
        items = [{"key": r.key, "title": r.title, "description": r.description, "uses_dates": r.uses_dates} for r in REPORTS.values()]
        return Response(ReportListItemSerializer(items, many=True).data)


class ReportView(APIView):
    permission_classes = [IsAdmin]

    @extend_schema(responses=ReportSerializer, parameters=PARAMETERS)
    def get(self, request, key):
        return Response(ReportSerializer(_build(key, request.query_params)).data)


class ReportExportView(APIView):
    """The report's table as a CSV download, with the same dates and filters."""

    permission_classes = [IsAdmin]

    @extend_schema(responses={(200, "text/csv"): OpenApiResponse(OpenApiTypes.STR)}, parameters=PARAMETERS)
    def get(self, request, key):
        report = _build(key, request.query_params)
        response = HttpResponse(to_csv(report), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="{filename(report)}"'
        response["Cache-Control"] = "no-store"
        return response
