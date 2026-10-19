from django.contrib.auth import authenticate, login, logout
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .serializers import LoginSerializer, MeSerializer, SessionSerializer


class InvalidCredentials(APIException):
    # 400 rather than DRF's AuthenticationFailed, which session auth turns into 403: a wrong
    # password must stay distinguishable from a CSRF rejection or a permission denial.
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "Email or password is incorrect."
    default_code = "invalid_credentials"


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfView(APIView):
    """Sets the csrftoken cookie so the SPA can make its first unsafe request (login)."""

    permission_classes = [AllowAny]

    @extend_schema(responses={204: None})
    def get(self, request):
        return Response(status=status.HTTP_204_NO_CONTENT)


# DRF only enforces CSRF for already-authenticated users; enforce it on login too
# so a third-party site can't log a till into an attacker's account (login CSRF).
@method_decorator(csrf_protect, name="dispatch")
class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    @extend_schema(request=LoginSerializer, responses={200: MeSerializer})
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authenticate(
            request,
            username=serializer.validated_data["email"].lower(),
            password=serializer.validated_data["password"],
        )
        if user is None:
            # Same message for unknown email, wrong password and deactivated accounts.
            raise InvalidCredentials()
        login(request, user)
        return Response(MeSerializer(user).data)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={204: None})
    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class SessionView(APIView):
    """Who is signed in, if anyone. Always 200 so the app's startup check isn't an error.

    Anonymous callers learn nothing beyond `user: null`; protected endpoints, including
    `me/`, still refuse them. Also sets the csrftoken cookie, so login needs no extra request.
    """

    permission_classes = [AllowAny]

    @extend_schema(responses={200: SessionSerializer})
    def get(self, request):
        user = request.user if request.user.is_authenticated else None
        return Response(SessionSerializer({"user": user}).data)


class MeView(APIView):
    @extend_schema(responses={200: MeSerializer})
    def get(self, request):
        return Response(MeSerializer(request.user).data)
