import uuid

from django.db.models import Exists, OuterRef, Prefetch, Q
from django.shortcuts import get_object_or_404
from django_filters import rest_framework as filters
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Role, User
from apps.accounts.permissions import IsStaffMember
from apps.catalog.models import Category, Product, Variant
from apps.store.models import StoreSettings

from . import services
from .models import Sale
from .pricing import tax_breakdown
from .serializers import (
    ApproverSerializer,
    BillingCategorySerializer,
    BillingSettingsSerializer,
    CheckoutSerializer,
    BillSerializer,
    QuoteSerializer,
    SaleSerializer,
    SellableProductSerializer,
)


def sellable_variants():
    return Variant.objects.filter(is_active=True, product__status=Product.Status.ACTIVE)


class SellableProductFilter(filters.FilterSet):
    q = filters.CharFilter(method="search", label="Name, SKU or exact barcode")
    category = filters.NumberFilter(field_name="category_id")

    def search(self, queryset, name, value):
        value = value.strip()
        if not value:
            return queryset
        variant_match = sellable_variants().filter(product=OuterRef("pk")).filter(
            Q(sku__icontains=value) | Q(barcode__iexact=value)
        )
        return queryset.filter(Q(name__icontains=value) | Q(sku__icontains=value) | Exists(variant_match))


class SellableProductListView(generics.ListAPIView):
    """What the till can sell: active products with at least one active variant, and only those variants.

    Separate from the admin catalogue (which shows cost prices and inactive items) so cashiers see
    nothing beyond what they need to bill.
    """

    permission_classes = [IsStaffMember]
    serializer_class = SellableProductSerializer
    filterset_class = SellableProductFilter

    def get_queryset(self):
        return (
            Product.objects.filter(status=Product.Status.ACTIVE)
            .filter(Exists(sellable_variants().filter(product=OuterRef("pk"))))
            .select_related("category__tax_rule", "tax_rule")
            .prefetch_related(
                Prefetch("variants", queryset=Variant.objects.filter(is_active=True).order_by("id"), to_attr="sellable_variants")
            )
            .order_by("name", "id")
        )


class BillingCategoryListView(generics.ListAPIView):
    permission_classes = [IsStaffMember]
    serializer_class = BillingCategorySerializer
    pagination_class = None
    queryset = Category.objects.order_by("sort_order", "name")


class BillingSettingsView(APIView):
    permission_classes = [IsStaffMember]

    @extend_schema(responses=BillingSettingsSerializer)
    def get(self, request):
        store = StoreSettings.load()
        return Response(
            BillingSettingsSerializer(
                {
                    "store_name": store.name,
                    "store_code": store.code,
                    "prices_include_tax": store.prices_include_tax,
                    "cashier_discount_limit_pct": store.cashier_discount_limit_pct,
                }
            ).data
        )


class ApproverListView(generics.ListAPIView):
    """Who can approve a discount above a cashier's limit."""

    permission_classes = [IsStaffMember]
    serializer_class = ApproverSerializer
    pagination_class = None

    def get_queryset(self):
        return User.objects.filter(
            is_active=True, role__in=[Role.SENIOR_CASHIER, Role.ADMIN], approval_pin_hash__gt=""
        ).order_by("full_name")


def _quote_response(bill, limit) -> dict:
    return {
        "lines": bill.lines,
        "prices_include_tax": bill.prices_include_tax,
        "subtotal_paise": bill.subtotal_paise,
        "discount_paise": bill.discount_paise,
        "taxable_paise": bill.taxable_paise,
        "tax_paise": bill.tax_paise,
        "total_paise": bill.total_paise,
        "tax_breakdown": tax_breakdown(bill.lines),
        "discount_limit_paise": limit,
        "needs_approval": limit is not None and bill.discount_paise > limit,
    }


class QuoteView(APIView):
    """Price a bill without saving anything. The bill panel shows these figures, never its own."""

    permission_classes = [IsStaffMember]

    @extend_schema(request=BillSerializer, responses=QuoteSerializer)
    def post(self, request):
        serializer = BillSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        bill, limit = services.quote(request.user, serializer.validated_data)
        return Response(QuoteSerializer(_quote_response(bill, limit)).data)


IDEMPOTENCY_HEADER = OpenApiParameter(
    "Idempotency-Key",
    location=OpenApiParameter.HEADER,
    required=True,
    type=str,
    description="UUID made when the payment step opens. Retrying with the same key returns the original sale.",
)


def sale_queryset():
    return Sale.objects.select_related("payment", "discount_approved_by").prefetch_related("lines")


class SaleCreateView(APIView):
    """Complete a sale. 201 when written; 200 when the same Idempotency-Key was already used for this bill."""

    permission_classes = [IsStaffMember]

    @extend_schema(
        request=CheckoutSerializer,
        parameters=[IDEMPOTENCY_HEADER],
        responses={201: SaleSerializer, 200: SaleSerializer},
    )
    def post(self, request):
        try:
            key = uuid.UUID(request.headers.get("Idempotency-Key", ""))
        except ValueError:
            raise ValidationError({"idempotency_key": ["Send a UUID Idempotency-Key header."]}) from None
        serializer = CheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        sale, created = services.checkout(request.user, serializer.validated_data, key)
        sale = sale_queryset().get(pk=sale.pk)
        return Response(SaleSerializer(sale).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class SaleDetailView(APIView):
    """A saved sale, for the receipt. Cashiers see their own sales; Senior cashiers and Admins see all."""

    permission_classes = [IsStaffMember]

    @extend_schema(responses=SaleSerializer)
    def get(self, request, invoice_no: str):
        sales = sale_queryset()
        if not request.user.can_approve_discounts:
            sales = sales.filter(cashier=request.user)
        return Response(SaleSerializer(get_object_or_404(sales, invoice_no=invoice_no)).data)
