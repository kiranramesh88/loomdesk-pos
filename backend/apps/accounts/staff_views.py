from django.db.models import Q
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from django_filters import rest_framework as filters
from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from . import staff
from .models import Role, User
from .permissions import IsAdmin
from .serializers import (
    PinSerializer,
    SetPasswordLinkSerializer,
    SetPasswordSerializer,
    SetupLinkSerializer,
    StaffCreatedSerializer,
    StaffCreateSerializer,
    StaffSerializer,
    StaffUpdateSerializer,
)

STATUS_CHOICES = [("active", "Active"), ("inactive", "Deactivated"), ("pending", "Password not set yet")]


class StaffFilter(filters.FilterSet):
    q = filters.CharFilter(method="search", label="Name or email (or part of it)")
    role = filters.ChoiceFilter(choices=Role.choices)
    status = filters.ChoiceFilter(method="by_status", choices=STATUS_CHOICES)

    def search(self, queryset, name, value):
        value = value.strip()
        return queryset.filter(Q(full_name__icontains=value) | Q(email__icontains=value)) if value else queryset

    def by_status(self, queryset, name, value):
        if value == "inactive":
            return queryset.filter(is_active=False)
        if value == "pending":
            # Django marks an unusable password with a leading "!".
            return queryset.filter(is_active=True, password__startswith="!")
        return queryset.filter(is_active=True)


class StaffListView(generics.ListCreateAPIView):
    """Staff accounts. Adding one returns its first set-password link, once (decision D5)."""

    permission_classes = [IsAdmin]
    serializer_class = StaffSerializer
    filterset_class = StaffFilter
    queryset = User.objects.order_by("-is_active", "full_name", "pk")

    @extend_schema(request=StaffCreateSerializer, responses={201: StaffCreatedSerializer})
    def post(self, request):
        serializer = StaffCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user, link = staff.create_staff(request.user, **serializer.validated_data)
        return Response(StaffCreatedSerializer({"staff": user, "setup_link": link}).data, status=status.HTTP_201_CREATED)


class StaffDetailView(APIView):
    permission_classes = [IsAdmin]

    @extend_schema(responses=StaffSerializer)
    def get(self, request, pk: int):
        return Response(StaffSerializer(generics.get_object_or_404(User, pk=pk)).data)

    @extend_schema(request=StaffUpdateSerializer, responses=StaffSerializer)
    def patch(self, request, pk: int):
        serializer = StaffUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(StaffSerializer(staff.update_staff(request.user, pk, **serializer.validated_data)).data)


class StaffDeactivateView(APIView):
    """Deactivated staff can't sign in and their open sessions stop working; their history stays."""

    permission_classes = [IsAdmin]

    @extend_schema(request=None, responses=StaffSerializer)
    def post(self, request, pk: int):
        return Response(StaffSerializer(staff.set_active(request.user, pk, False)).data)


class StaffReactivateView(APIView):
    permission_classes = [IsAdmin]

    @extend_schema(request=None, responses=StaffSerializer)
    def post(self, request, pk: int):
        return Response(StaffSerializer(staff.set_active(request.user, pk, True)).data)


class StaffPinView(APIView):
    """The discount approval PIN, typed by the staff member themselves. Never returned."""

    permission_classes = [IsAdmin]

    @extend_schema(request=PinSerializer, responses=StaffSerializer)
    def put(self, request, pk: int):
        serializer = PinSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(StaffSerializer(staff.set_pin(request.user, pk, serializer.validated_data["pin"])).data)

    @extend_schema(request=None, responses=StaffSerializer)
    def delete(self, request, pk: int):
        return Response(StaffSerializer(staff.clear_pin(request.user, pk)).data)


class StaffSetupLinkView(APIView):
    """A new one-time set-password link, shown once; any earlier link stops working."""

    permission_classes = [IsAdmin]

    @extend_schema(request=None, responses={201: SetupLinkSerializer})
    def post(self, request, pk: int):
        return Response(SetupLinkSerializer(staff.issue_setup_link(request.user, pk)).data, status=status.HTTP_201_CREATED)


class SetPasswordLinkView(APIView):
    """Check a set-password link before showing the form. Throttled like sign-in."""

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "set_password"

    @extend_schema(responses=SetPasswordLinkSerializer)
    def get(self, request, uid: str, token: str):
        return Response(SetPasswordLinkSerializer(staff.user_for_link(uid, token)).data)


# Anonymous like login, so DRF wouldn't check CSRF on its own.
@method_decorator(csrf_protect, name="dispatch")
class SetPasswordView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "set_password"

    @extend_schema(request=SetPasswordSerializer, responses={204: None})
    def post(self, request):
        serializer = SetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        staff.set_password_from_link(data["uid"], data["token"], data["password"])
        return Response(status=status.HTTP_204_NO_CONTENT)
