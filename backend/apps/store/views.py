from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin

from .models import StoreSettings
from .serializers import StoreSerializer


class StoreView(APIView):
    """Read-only store identity for the admin sidebar. Editing belongs to the Settings phase."""

    permission_classes = [IsAdmin]

    @extend_schema(responses={200: StoreSerializer})
    def get(self, request):
        return Response(StoreSerializer(StoreSettings.load()).data)
