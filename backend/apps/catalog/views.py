import django_filters
from django.db import IntegrityError
from django.db.models import Case, Count, Exists, F, IntegerField, Max, Min, OuterRef, Q, Sum, Value, When
from django.db.models.functions import Coalesce
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from apps.accounts.permissions import IsAdmin

from .models import Category, Product, TaxRule, Variant
from .serializers import (
    CategorySerializer,
    ProductDetailSerializer,
    ProductImageSerializer,
    ProductListSerializer,
    ProductWriteSerializer,
    TaxRuleSerializer,
)

ACTIVE = Q(variants__is_active=True)


def catalogue_rows():
    """Products with stock figures over their active variants (one join, so the aggregates stay exact)."""
    unit_price = Coalesce("variants__price_override_paise", "base_price_paise")
    return (
        Product.objects.select_related("category")
        .annotate(
            variant_count=Count("variants", filter=ACTIVE),
            total_on_hand=Coalesce(Sum("variants__on_hand", filter=ACTIVE), 0),
            low_count=Count("variants", filter=ACTIVE & Q(variants__on_hand__lte=F("variants__reorder_level"))),
            min_price_paise=Coalesce(Min(unit_price, filter=ACTIVE), "base_price_paise"),
            max_price_paise=Coalesce(Max(unit_price, filter=ACTIVE), "base_price_paise"),
        )
        .annotate(
            # Matches Variant.stock_state: nothing left is out; any size at or below reorder is low.
            stock_state=Case(
                When(total_on_hand__lte=0, then=Value("out_of_stock")),
                When(low_count__gt=0, then=Value("low_stock")),
                default=Value("in_stock"),
            )
        )
    )


class ProductFilter(django_filters.FilterSet):
    q = django_filters.CharFilter(method="search", label="Name, product or variant SKU, or barcode")
    category = django_filters.ModelChoiceFilter(queryset=Category.objects.all())
    status = django_filters.ChoiceFilter(choices=Product.Status.choices)
    stock = django_filters.ChoiceFilter(
        method="by_stock",
        choices=[("in_stock", "In stock"), ("low_stock", "Low stock"), ("out_of_stock", "Out of stock")],
    )
    ordering = django_filters.OrderingFilter(
        fields=[
            ("name", "name"),
            ("sku", "sku"),
            ("base_price_paise", "price"),
            ("total_on_hand", "stock"),
            ("updated_at", "updated"),
        ]
    )

    class Meta:
        model = Product
        fields = ["q", "category", "status", "stock"]

    @property
    def qs(self):
        # The id tiebreak keeps page boundaries stable when sort values repeat.
        queryset = super().qs
        return queryset.order_by(*queryset.query.order_by, "id") if queryset.query.order_by else queryset.order_by("name", "id")

    def search(self, queryset, name, value):
        value = value.strip()
        if not value:
            return queryset
        # A subquery rather than a join, so matching several variants can't duplicate rows or skew sums.
        variant_match = Variant.objects.filter(product=OuterRef("pk")).filter(
            Q(sku__icontains=value) | Q(barcode__iexact=value)
        )
        return queryset.filter(Q(name__icontains=value) | Q(sku__icontains=value) | Exists(variant_match))

    def by_stock(self, queryset, name, value):
        return queryset.filter(stock_state=value)


class ProductViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Admin catalogue. Products are deactivated, never deleted, so sales and stock history keep their links."""

    permission_classes = [IsAdmin]
    filterset_class = ProductFilter
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        if self.action == "list":
            return catalogue_rows()
        return Product.objects.select_related("category__tax_rule", "tax_rule")

    def get_serializer_class(self):
        if self.action == "list":
            return ProductListSerializer
        if self.action in {"create", "partial_update"}:
            return ProductWriteSerializer
        if self.action == "image":
            return ProductImageSerializer
        return ProductDetailSerializer

    @staticmethod
    def _save(serializer):
        try:
            return serializer.save()
        except IntegrityError:
            # Validation checks uniqueness first; this only fires when another save won a race.
            raise serializers.ValidationError(
                "Another change used one of these SKUs or barcodes just now. Reload and try again."
            ) from None

    def _detail(self, product, status_code=status.HTTP_200_OK):
        product = self.get_queryset().get(pk=product.pk)
        return Response(ProductDetailSerializer(product, context=self.get_serializer_context()).data, status=status_code)

    @extend_schema(request=ProductWriteSerializer, responses={201: ProductDetailSerializer})
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return self._detail(self._save(serializer), status.HTTP_201_CREATED)

    @extend_schema(request=ProductWriteSerializer, responses={200: ProductDetailSerializer})
    def partial_update(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object(), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        return self._detail(self._save(serializer))

    @extend_schema(request={"multipart/form-data": ProductImageSerializer}, responses={200: ProductDetailSerializer})
    @action(detail=True, methods=["post"], parser_classes=[MultiPartParser])
    def image(self, request, pk=None):
        product = self.get_object()
        serializer = ProductImageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        old = product.image.name
        upload = serializer.validated_data["image"]
        # Named from the SKU and the detected format, never the client's filename.
        extension = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}[upload.image.format]
        product.image.save(f"{product.sku.lower()}.{extension}", upload, save=True)
        if old and old != product.image.name:
            product.image.storage.delete(old)
        return self._detail(product)

    @extend_schema(request=None, responses={200: ProductDetailSerializer})
    @image.mapping.delete
    def remove_image(self, request, pk=None):
        product = self.get_object()
        if product.image:
            product.image.delete(save=True)
        return self._detail(product)


class CategoryViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """Categories with their HSN code and tax rule, for the product form and catalogue filter."""

    permission_classes = [IsAdmin]
    serializer_class = CategorySerializer
    queryset = Category.objects.select_related("tax_rule")
    pagination_class = None
    filter_backends = []


class TaxRuleViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    permission_classes = [IsAdmin]
    serializer_class = TaxRuleSerializer
    queryset = TaxRule.objects.order_by("name")
    pagination_class = None
    filter_backends = []
