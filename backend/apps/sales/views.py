import uuid

from django.db.models import Count, Exists, OuterRef, Prefetch, Q, Sum
from django.db.models.functions import Coalesce, TruncDate
from django.shortcuts import get_object_or_404
from django_filters import rest_framework as filters
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Role, User
from apps.accounts.permissions import IsAdmin, IsStaffMember
from apps.catalog.models import Category, Product, Variant
from apps.store.models import StoreSettings

from . import services
from .models import Payment, Sale
from .pricing import tax_breakdown
from .serializers import (
    ApproverSerializer,
    BillingCategorySerializer,
    BillingSettingsSerializer,
    CheckoutSerializer,
    BillSerializer,
    QuoteSerializer,
    SaleCashierSerializer,
    SaleListItemSerializer,
    SaleSerializer,
    SalesSummarySerializer,
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
    return Sale.objects.select_related("payment").prefetch_related("lines")


def visible_sales(user, queryset=None):
    """Sales this user may read. Cashiers see their own; Senior cashiers and Admins see every sale."""
    sales = Sale.objects.all() if queryset is None else queryset
    return sales if user.can_approve_discounts else sales.filter(cashier=user)


class SaleFilter(filters.FilterSet):
    q = filters.CharFilter(method="search", label="Invoice number (or part of it)")
    date_from = filters.DateFilter(field_name="created_at", lookup_expr="date__gte", label="On or after (store time)")
    date_to = filters.DateFilter(field_name="created_at", lookup_expr="date__lte", label="On or before (store time)")
    cashier = filters.NumberFilter(field_name="cashier_id")
    method = filters.ChoiceFilter(field_name="payment__method", choices=Payment.Method.choices)
    status = filters.ChoiceFilter(choices=Sale.Status.choices)

    def search(self, queryset, name, value):
        value = value.strip()
        return queryset.filter(invoice_no__icontains=value) if value else queryset

    def filter_queryset(self, queryset):
        start, end = self.form.cleaned_data.get("date_from"), self.form.cleaned_data.get("date_to")
        if start and end and start > end:
            raise ValidationError({"date_to": ["The end date is before the start date."]})
        return super().filter_queryset(queryset)


class SaleListCreateView(generics.ListAPIView):
    """GET: sales history, newest first. POST: complete a sale.

    The list is scoped like receipts: cashiers get their own sales, Senior cashiers and Admins get all.
    """

    permission_classes = [IsStaffMember]
    serializer_class = SaleListItemSerializer
    filterset_class = SaleFilter

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):  # schema generation has no signed-in user
            return Sale.objects.none()
        return visible_sales(self.request.user).select_related("payment").annotate(item_count=Sum("lines__quantity")).order_by("-created_at", "-id")

    @extend_schema(
        request=CheckoutSerializer,
        parameters=[IDEMPOTENCY_HEADER],
        responses={201: SaleSerializer, 200: SaleSerializer},
        description="Complete a sale. 201 when written; 200 when the same Idempotency-Key was already used for this bill.",
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
        sale = get_object_or_404(visible_sales(request.user, sale_queryset()), invoice_no=invoice_no)
        return Response(SaleSerializer(sale).data)


def _group(sales, *fields):
    # order_by() first: Sale's default ordering would otherwise join the GROUP BY and split the groups.
    return sales.order_by().values(*fields).annotate(sale_count=Count("id"), total_paise=Sum("total_paise"))


class SalesSummaryView(generics.GenericAPIView):
    """Admin summary of completed sales matching the same filters as the list.

    Totals are the saved bill totals (after discounts, GST included). UPI and card amounts are what the
    cashier recorded; none is gateway-verified, so this is not a settlement figure. Returns are not
    deducted yet because the returns module does not exist.
    """

    permission_classes = [IsAdmin]
    filterset_class = SaleFilter
    pagination_class = None

    def get_queryset(self):
        return Sale.objects.filter(status=Sale.Status.COMPLETED)

    @extend_schema(
        responses=SalesSummarySerializer,
        # The list's filters, declared by hand: drf-spectacular only adds filterset parameters to list views.
        parameters=[
            OpenApiParameter("q", str, description="Invoice number (or part of it)"),
            OpenApiParameter("date_from", OpenApiTypes.DATE, description="On or after (store time)"),
            OpenApiParameter("date_to", OpenApiTypes.DATE, description="On or before (store time)"),
            OpenApiParameter("cashier", int),
            OpenApiParameter("method", str, enum=Payment.Method.values),
        ],
    )
    def get(self, request):
        sales = self.filter_queryset(self.get_queryset())
        totals = sales.aggregate(
            sale_count=Count("id"),
            **{f: Coalesce(Sum(f), 0) for f in ("total_paise", "subtotal_paise", "discount_paise", "tax_paise")},
        )
        methods = {row["payment__method"]: row for row in _group(sales, "payment__method")}
        days = _group(sales.annotate(date=TruncDate("created_at")), "date").order_by("-date")
        cashiers = _group(sales, "cashier_id", "cashier__full_name").order_by("-total_paise", "cashier__full_name")
        summary = {
            **totals,
            "by_method": [
                {
                    "method": method,
                    "sale_count": methods.get(method, {}).get("sale_count", 0),
                    "total_paise": methods.get(method, {}).get("total_paise", 0),
                }
                for method in Payment.Method.values
            ],
            "by_day": [{"date": r["date"], "sale_count": r["sale_count"], "total_paise": r["total_paise"]} for r in days],
            "by_cashier": [
                {
                    "cashier": r["cashier_id"],
                    "cashier_name": r["cashier__full_name"],
                    "sale_count": r["sale_count"],
                    "total_paise": r["total_paise"],
                }
                for r in cashiers
            ],
        }
        return Response(SalesSummarySerializer(summary).data)


class SaleCashierListView(generics.ListAPIView):
    """Staff who have recorded at least one sale, including deactivated accounts, for the cashier filter."""

    permission_classes = [IsAdmin]
    serializer_class = SaleCashierSerializer
    pagination_class = None

    def get_queryset(self):
        return User.objects.filter(Exists(Sale.objects.filter(cashier=OuterRef("pk")))).order_by("full_name", "id")
