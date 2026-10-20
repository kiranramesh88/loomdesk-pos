import uuid

import django_filters
from django.db.models import F, IntegerField, OuterRef, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin

from . import services
from .models import Purchase, Supplier, SupplierPayment
from .serializers import (
    CancelPurchaseSerializer,
    PurchaseLinesSerializer,
    PurchaseListItemSerializer,
    PurchaseQuoteSerializer,
    PurchaseSerializer,
    PurchaseWriteSerializer,
    SupplierDetailSerializer,
    SupplierListSerializer,
    SupplierPaymentSerializer,
    SupplierPaymentWriteSerializer,
    SupplierStatementSerializer,
    SupplierWriteSerializer,
)

IDEMPOTENCY_HEADER = OpenApiParameter(
    "Idempotency-Key",
    location=OpenApiParameter.HEADER,
    required=True,
    type=str,
    description="UUID made when the form opens. Retrying with the same key returns the first record instead of adding another.",
)


def _idempotency_key(request) -> uuid.UUID:
    try:
        return uuid.UUID(request.headers.get("Idempotency-Key", ""))
    except ValueError:
        raise ValidationError({"idempotency_key": ["Send a UUID Idempotency-Key header."]}) from None


def _sum(queryset, field):
    total = queryset.order_by().values("supplier").annotate(t=Sum(field)).values("t")
    return Coalesce(Subquery(total), Value(0), output_field=IntegerField())


def suppliers_with_balances():
    """Recorded balance = received purchases − recorded payments. Subqueries, so the two sums can't multiply."""
    received = Purchase.objects.filter(supplier=OuterRef("pk"), status=Purchase.Status.RECEIVED)
    awaiting = Purchase.objects.filter(supplier=OuterRef("pk"), status=Purchase.Status.ORDERED)
    paid = SupplierPayment.objects.filter(supplier=OuterRef("pk"))
    return Supplier.objects.annotate(
        received_paise=_sum(received, "total_paise"),
        awaiting_paise=_sum(awaiting, "total_paise"),
        paid_paise=_sum(paid, "amount_paise"),
    ).annotate(balance_paise=F("received_paise") - F("paid_paise"))


class SupplierFilter(django_filters.FilterSet):
    q = django_filters.CharFilter(method="search", label="Name, contact, phone, email or GSTIN")
    status = django_filters.ChoiceFilter(choices=Supplier.Status.choices)
    category = django_filters.CharFilter(field_name="category", lookup_expr="iexact")
    ordering = django_filters.OrderingFilter(fields=[("name", "name"), ("balance_paise", "balance")])

    class Meta:
        model = Supplier
        fields = ["q", "status", "category"]

    @property
    def qs(self):
        queryset = super().qs
        return queryset.order_by(*(queryset.query.order_by or ("name",)), "id")

    def search(self, queryset, name, value):
        value = value.strip()
        if not value:
            return queryset
        return queryset.filter(
            Q(name__icontains=value) | Q(contact_name__icontains=value) | Q(phone__icontains=value)
            | Q(email__icontains=value) | Q(gstin__iexact=value)
        )


class SupplierListCreateView(generics.ListCreateAPIView):
    """Suppliers with their recorded balances. Suppliers are deactivated, never deleted."""

    permission_classes = [IsAdmin]
    filterset_class = SupplierFilter

    def get_queryset(self):
        return suppliers_with_balances()

    def get_serializer_class(self):
        return SupplierWriteSerializer if self.request.method == "POST" else SupplierListSerializer

    @extend_schema(request=SupplierWriteSerializer, responses={201: SupplierDetailSerializer})
    def post(self, request):
        serializer = SupplierWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        supplier = serializer.save()
        body = SupplierDetailSerializer(suppliers_with_balances().get(pk=supplier.pk)).data
        return Response(body, status=status.HTTP_201_CREATED)


class SupplierCategoryListView(APIView):
    permission_classes = [IsAdmin]

    @extend_schema(responses={200: {"type": "array", "items": {"type": "string"}}})
    def get(self, request):
        return Response(list(Supplier.objects.order_by("category").values_list("category", flat=True).distinct()))


class SupplierDetailView(APIView):
    permission_classes = [IsAdmin]

    @extend_schema(responses=SupplierDetailSerializer)
    def get(self, request, pk: int):
        return Response(SupplierDetailSerializer(get_object_or_404(suppliers_with_balances(), pk=pk)).data)

    @extend_schema(request=SupplierWriteSerializer, responses=SupplierDetailSerializer)
    def patch(self, request, pk: int):
        supplier = get_object_or_404(Supplier, pk=pk)
        serializer = SupplierWriteSerializer(supplier, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(SupplierDetailSerializer(suppliers_with_balances().get(pk=pk)).data)


def purchase_queryset():
    return Purchase.objects.select_related("supplier", "created_by", "received_by", "cancelled_by").prefetch_related(
        "lines__variant"
    )


class PurchaseFilter(django_filters.FilterSet):
    status = django_filters.ChoiceFilter(choices=Purchase.Status.choices)

    class Meta:
        model = Purchase
        fields = ["status"]


class SupplierPurchaseListView(generics.ListAPIView):
    """GET: this supplier's purchases, newest first. POST: record a purchase (stock is unchanged until received)."""

    permission_classes = [IsAdmin]
    serializer_class = PurchaseListItemSerializer
    filterset_class = PurchaseFilter

    def get_queryset(self):
        return (
            Purchase.objects.filter(supplier_id=self.kwargs.get("pk"))
            .select_related("supplier")
            .annotate(item_count=Coalesce(Sum("lines__quantity"), 0))
            .order_by("-purchase_date", "-id")
        )

    def list(self, request, *args, **kwargs):
        get_object_or_404(Supplier, pk=kwargs["pk"])
        return super().list(request, *args, **kwargs)

    @extend_schema(
        request=PurchaseWriteSerializer,
        parameters=[IDEMPOTENCY_HEADER],
        responses={201: PurchaseSerializer, 200: PurchaseSerializer},
        description="Record a purchase. 201 when written; 200 when the same Idempotency-Key was already used for it.",
    )
    def post(self, request, pk: int):
        supplier = get_object_or_404(Supplier, pk=pk)
        key = _idempotency_key(request)
        serializer = PurchaseWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        purchase, created = services.create_purchase(request.user, supplier, serializer.validated_data, key)
        body = PurchaseSerializer(purchase_queryset().get(pk=purchase.pk)).data
        return Response(body, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class PurchaseQuoteView(APIView):
    """Price purchase lines without saving, so the form shows the server's own totals."""

    permission_classes = [IsAdmin]

    @extend_schema(request=PurchaseLinesSerializer, responses=PurchaseQuoteSerializer)
    def post(self, request):
        serializer = PurchaseLinesSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(PurchaseQuoteSerializer(services.price_lines(serializer.validated_data["lines"])).data)


class PurchaseDetailView(APIView):
    permission_classes = [IsAdmin]

    @extend_schema(responses=PurchaseSerializer)
    def get(self, request, number: str):
        return Response(PurchaseSerializer(get_object_or_404(purchase_queryset(), number=number)).data)

    @extend_schema(request=PurchaseWriteSerializer, responses=PurchaseSerializer)
    def put(self, request, number: str):
        purchase = get_object_or_404(Purchase, number=number)
        serializer = PurchaseWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.update_purchase(purchase, serializer.validated_data)
        return Response(PurchaseSerializer(purchase_queryset().get(pk=purchase.pk)).data)


class PurchaseReceiveView(APIView):
    """Receive the goods: every line is added to stock once, as purchase movements referencing this purchase."""

    permission_classes = [IsAdmin]

    @extend_schema(request=None, responses=PurchaseSerializer)
    def post(self, request, number: str):
        purchase = get_object_or_404(Purchase, number=number)
        services.receive_purchase(purchase, request.user)
        return Response(PurchaseSerializer(purchase_queryset().get(pk=purchase.pk)).data)


class PurchaseCancelView(APIView):
    permission_classes = [IsAdmin]

    @extend_schema(request=CancelPurchaseSerializer, responses=PurchaseSerializer)
    def post(self, request, number: str):
        purchase = get_object_or_404(Purchase, number=number)
        serializer = CancelPurchaseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.cancel_purchase(purchase, request.user, serializer.validated_data["reason"])
        return Response(PurchaseSerializer(purchase_queryset().get(pk=purchase.pk)).data)


class SupplierPaymentListView(generics.ListAPIView):
    """GET: payments recorded for this supplier. POST: record one. These are staff entries, not verified settlements."""

    permission_classes = [IsAdmin]
    serializer_class = SupplierPaymentSerializer

    def get_queryset(self):
        return (
            SupplierPayment.objects.filter(supplier_id=self.kwargs.get("pk"))
            .select_related("recorded_by")
            .order_by("-paid_on", "-id")
        )

    def list(self, request, *args, **kwargs):
        get_object_or_404(Supplier, pk=kwargs["pk"])
        return super().list(request, *args, **kwargs)

    @extend_schema(
        request=SupplierPaymentWriteSerializer,
        parameters=[IDEMPOTENCY_HEADER],
        responses={201: SupplierPaymentSerializer, 200: SupplierPaymentSerializer},
    )
    def post(self, request, pk: int):
        supplier = get_object_or_404(Supplier, pk=pk)
        key = _idempotency_key(request)
        serializer = SupplierPaymentWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payment, created = services.record_payment(request.user, supplier, serializer.validated_data, key)
        return Response(
            SupplierPaymentSerializer(payment).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK
        )


class SupplierStatementView(APIView):
    permission_classes = [IsAdmin]

    @extend_schema(responses=SupplierStatementSerializer)
    def get(self, request, pk: int):
        supplier = get_object_or_404(Supplier, pk=pk)
        entries = services.statement(supplier)
        balance = entries[-1]["balance_paise"] if entries else 0
        return Response(SupplierStatementSerializer({"entries": entries, "balance_paise": balance}).data)
