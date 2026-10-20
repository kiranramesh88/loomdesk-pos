import uuid

from django.db.models import Prefetch, Q, Sum
from django.shortcuts import get_object_or_404
from django_filters import rest_framework as filters
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin
from apps.sales.models import Payment

from . import services
from .models import Return, ReturnLine
from .serializers import (
    ReturnableSaleSerializer,
    ReturnCreateSerializer,
    ReturnListItemSerializer,
    ReturnQuoteSerializer,
    ReturnRequestSerializer,
    ReturnSerializer,
)

IDEMPOTENCY_HEADER = OpenApiParameter(
    "Idempotency-Key",
    location=OpenApiParameter.HEADER,
    required=True,
    type=str,
    description="UUID made when the review step opens. Retrying with the same key returns the original return.",
)


def return_queryset():
    return Return.objects.select_related("sale", "refund").prefetch_related(
        Prefetch("lines", queryset=ReturnLine.objects.select_related("sale_line"))
    )


class ReturnFilter(filters.FilterSet):
    q = filters.CharFilter(method="search", label="Return or invoice number (or part of it)")
    date_from = filters.DateFilter(field_name="created_at", lookup_expr="date__gte", label="On or after (store time)")
    date_to = filters.DateFilter(field_name="created_at", lookup_expr="date__lte", label="On or before (store time)")
    disposition = filters.ChoiceFilter(method="by_disposition", choices=ReturnLine.Disposition.choices)
    method = filters.ChoiceFilter(field_name="refund__method", choices=Payment.Method.choices)

    def search(self, queryset, name, value):
        value = value.strip()
        return queryset.filter(Q(number__icontains=value) | Q(sale__invoice_no__icontains=value)) if value else queryset

    def by_disposition(self, queryset, name, value):
        return queryset.filter(pk__in=ReturnLine.objects.filter(disposition=value).values("ret"))

    def filter_queryset(self, queryset):
        start, end = self.form.cleaned_data.get("date_from"), self.form.cleaned_data.get("date_to")
        if start and end and start > end:
            raise ValidationError({"date_to": ["The end date is before the start date."]})
        return super().filter_queryset(queryset)


def _idempotency_key(request) -> uuid.UUID:
    try:
        return uuid.UUID(request.headers.get("Idempotency-Key", ""))
    except ValueError:
        raise ValidationError({"idempotency_key": ["Send a UUID Idempotency-Key header."]}) from None


class ReturnListCreateView(generics.ListAPIView):
    """GET: returns, newest first. POST: record a return and its refund. Admin only (decision D1)."""

    permission_classes = [IsAdmin]
    serializer_class = ReturnListItemSerializer
    filterset_class = ReturnFilter

    def get_queryset(self):
        return (
            Return.objects.select_related("sale", "refund")
            .prefetch_related("lines")
            .annotate(units=Sum("lines__quantity"))
            .order_by("-created_at", "-id")
        )

    @extend_schema(
        request=ReturnCreateSerializer,
        parameters=[IDEMPOTENCY_HEADER],
        responses={201: ReturnSerializer, 200: ReturnSerializer},
        description="Record a return. 201 when written; 200 when the same Idempotency-Key was already used for it.",
    )
    def post(self, request):
        key = _idempotency_key(request)
        serializer = ReturnCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ret, created = services.create_return(request.user, serializer.validated_data, key)
        return Response(
            ReturnSerializer(return_queryset().get(pk=ret.pk)).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class ReturnQuoteView(APIView):
    """Work out a return's refund without saving anything, for the review step."""

    permission_classes = [IsAdmin]

    @extend_schema(request=ReturnRequestSerializer, responses=ReturnQuoteSerializer)
    def post(self, request):
        serializer = ReturnRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        sale, planned, totals = services.quote_return(serializer.validated_data)
        lines = [
            {"sale_line": p.sale_line, "quantity": p.quantity, "disposition": p.disposition, **vars(p.figures)}
            for p in planned
        ]
        return Response(ReturnQuoteSerializer({"invoice_no": sale.invoice_no, "lines": lines, "totals": totals}).data)


class ReturnableSaleView(APIView):
    """A sale's lines with sold, already returned and still returnable quantities."""

    permission_classes = [IsAdmin]

    @extend_schema(responses=ReturnableSaleSerializer)
    def get(self, request, invoice_no: str):
        sale = services.get_sale(invoice_no.strip().upper(), lock=False)
        context = {"returned": services.returned_by_line(sale), "refund_methods": services.allowed_refund_methods(sale)}
        return Response(ReturnableSaleSerializer(sale, context=context).data)


class ReturnDetailView(APIView):
    permission_classes = [IsAdmin]

    @extend_schema(responses=ReturnSerializer)
    def get(self, request, number: str):
        return Response(ReturnSerializer(get_object_or_404(return_queryset(), number=number)).data)
