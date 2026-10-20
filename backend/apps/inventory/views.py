import django_filters
from django.db.models import BooleanField, Case, Count, ExpressionWrapper, F, OuterRef, Q, Subquery, Sum, Value, When
from django.db.models.functions import Coalesce
from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin
from apps.catalog.models import Category, Product, Variant

from .models import StockMovement
from .serializers import (
    InventoryMovementSerializer,
    InventorySummarySerializer,
    InventoryVariantSerializer,
    StockAdjustmentResultSerializer,
    StockAdjustmentSerializer,
)
from .services import adjust_stock

SELLABLE = Q(is_active=True, product__status=Product.Status.ACTIVE)
# Same rule as Variant.stock_state: nothing left is out; at or below the reorder level is low.
OUT = Q(on_hand__lte=0)
LOW = Q(on_hand__gt=0, on_hand__lte=F("reorder_level"))


def inventory_rows():
    latest = StockMovement.objects.filter(variant=OuterRef("pk")).order_by("-created_at", "-id")
    product_total = (
        Variant.objects.filter(product=OuterRef("product")).order_by().values("product").annotate(total=Sum("on_hand")).values("total")
    )
    return Variant.objects.select_related("product__category").annotate(
        # For filtering; rows show Variant.stock_state, which applies the same rule.
        state_key=Case(When(OUT, then=Value("out_of_stock")), When(LOW, then=Value("low_stock")), default=Value("in_stock")),
        sellable=ExpressionWrapper(SELLABLE, output_field=BooleanField()),
        product_on_hand=Coalesce(Subquery(product_total), 0),
        last_movement_at=Subquery(latest.values("created_at")[:1]),
        last_movement_type=Subquery(latest.values("type")[:1]),
    )


class InventoryFilter(django_filters.FilterSet):
    q = django_filters.CharFilter(method="search", label="Product name or SKU, variant SKU, or exact barcode")
    category = django_filters.ModelChoiceFilter(field_name="product__category", queryset=Category.objects.all())
    state = django_filters.ChoiceFilter(
        method="by_state",
        choices=[("in_stock", "In stock"), ("low_stock", "Low stock"), ("out_of_stock", "Out of stock")],
    )
    status = django_filters.ChoiceFilter(
        method="by_status",
        choices=[("active", "Sellable"), ("inactive", "Inactive variant or product")],
    )
    ordering = django_filters.OrderingFilter(
        fields=[("product__name", "product"), ("on_hand", "stock"), ("last_movement_at", "moved")]
    )

    class Meta:
        model = Variant
        fields = ["q", "category", "state", "status"]

    @property
    def qs(self):
        # Stable pages: product, then size order of creation, with the id as the final tiebreak.
        queryset = super().qs
        order = queryset.query.order_by or ("product__name", "product_id")
        return queryset.order_by(*order, "id")

    def search(self, queryset, name, value):
        value = value.strip()
        if not value:
            return queryset
        return queryset.filter(
            Q(product__name__icontains=value) | Q(product__sku__icontains=value) | Q(sku__icontains=value) | Q(barcode__iexact=value)
        )

    def by_state(self, queryset, name, value):
        return queryset.filter(state_key=value)

    def by_status(self, queryset, name, value):
        return queryset.filter(sellable=value == "active")


class InventoryVariantListView(generics.ListAPIView):
    """Variant-level stock for every product, active or not, so stock on deactivated items stays visible."""

    permission_classes = [IsAdmin]
    serializer_class = InventoryVariantSerializer
    filterset_class = InventoryFilter

    def get_queryset(self):
        return inventory_rows()


class InventoryVariantDetailView(generics.RetrieveAPIView):
    permission_classes = [IsAdmin]
    serializer_class = InventoryVariantSerializer

    def get_queryset(self):
        return inventory_rows()


class InventorySummaryView(APIView):
    permission_classes = [IsAdmin]

    @extend_schema(responses=InventorySummarySerializer)
    def get(self, request):
        tracked = Variant.objects.filter(SELLABLE)
        summary = tracked.aggregate(
            tracked_variants=Count("id"),
            low_stock=Count("id", filter=LOW),
            out_of_stock=Count("id", filter=OUT),
            units_on_hand=Coalesce(Sum("on_hand"), 0),
        )
        return Response(InventorySummarySerializer(summary).data)


class MovementFilter(django_filters.FilterSet):
    q = django_filters.CharFilter(method="search", label="Product name, variant SKU or reference")
    variant = django_filters.NumberFilter(field_name="variant_id")
    type = django_filters.ChoiceFilter(choices=StockMovement.Type.choices)
    date_from = django_filters.DateFilter(field_name="created_at", lookup_expr="date__gte", label="On or after (store time)")
    date_to = django_filters.DateFilter(field_name="created_at", lookup_expr="date__lte", label="On or before (store time)")

    class Meta:
        model = StockMovement
        fields = ["q", "variant", "type", "date_from", "date_to"]

    def search(self, queryset, name, value):
        value = value.strip()
        if not value:
            return queryset
        return queryset.filter(
            Q(variant__product__name__icontains=value) | Q(variant__sku__icontains=value) | Q(reference__icontains=value)
        )

    def filter_queryset(self, queryset):
        start, end = self.form.cleaned_data.get("date_from"), self.form.cleaned_data.get("date_to")
        if start and end and start > end:
            raise ValidationError({"date_to": ["The end date is before the start date."]})
        return super().filter_queryset(queryset)


class MovementListView(generics.ListAPIView):
    """The stock ledger, newest first. Read-only: movements are never edited or deleted."""

    permission_classes = [IsAdmin]
    serializer_class = InventoryMovementSerializer
    filterset_class = MovementFilter

    def get_queryset(self):
        return StockMovement.objects.select_related("variant__product", "actor").order_by("-created_at", "-id")


class StockAdjustmentView(APIView):
    """Record a manual adjustment (add, remove or counted quantity) as one stock movement."""

    permission_classes = [IsAdmin]

    @extend_schema(request=StockAdjustmentSerializer, responses={201: StockAdjustmentResultSerializer})
    def post(self, request):
        serializer = StockAdjustmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        movement = adjust_stock(
            variant=data["variant"],
            kind=data["kind"],
            quantity=data["quantity"],
            reason=data["reason"],
            expected_on_hand=data["expected_on_hand"],
            actor=request.user,
        )
        movement = StockMovement.objects.select_related("variant__product", "actor").get(pk=movement.pk)
        variant = inventory_rows().get(pk=movement.variant_id)
        return Response(
            StockAdjustmentResultSerializer({"movement": movement, "variant": variant}).data, status=status.HTTP_201_CREATED
        )
