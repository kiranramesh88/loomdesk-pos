from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin

from . import services
from .models import StoreSettings
from .serializers import StoreSerializer, StoreSettingsSerializer, StoreSettingsUpdateSerializer


class StoreView(APIView):
    """Read-only store identity for the admin sidebar. Settings has its own endpoint, `settings/`."""

    permission_classes = [IsAdmin]

    @extend_schema(responses={200: StoreSerializer})
    def get(self, request):
        return Response(StoreSerializer(StoreSettings.load()).data)


class StoreSettingsView(APIView):
    """The store's details and pricing rules (decision D10: GST rules themselves stay read-only).

    A change applies to bills priced from now on. Saved sales and receipts keep what they were sold with,
    and a bill already on the till gets 409 `total_changed` at checkout if its total moved.
    """

    permission_classes = [IsAdmin]

    @extend_schema(responses={200: StoreSettingsSerializer})
    def get(self, request):
        return Response(StoreSettingsSerializer(StoreSettings.load()).data)

    @extend_schema(request=StoreSettingsUpdateSerializer, responses={200: StoreSettingsSerializer})
    def patch(self, request):
        serializer = StoreSettingsUpdateSerializer(data=request.data, context={"store": StoreSettings.load()})
        serializer.is_valid(raise_exception=True)
        return Response(StoreSettingsSerializer(services.update_settings(request.user, serializer.validated_data)).data)
