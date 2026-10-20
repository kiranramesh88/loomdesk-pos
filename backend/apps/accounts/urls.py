from django.urls import path

from .staff_views import SetPasswordLinkView, SetPasswordView
from .views import CsrfView, LoginView, LogoutView, MeView, SessionView

urlpatterns = [
    path("csrf/", CsrfView.as_view(), name="auth-csrf"),
    path("login/", LoginView.as_view(), name="auth-login"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
    path("me/", MeView.as_view(), name="auth-me"),
    path("session/", SessionView.as_view(), name="auth-session"),
    path("set-password/", SetPasswordView.as_view(), name="auth-set-password"),
    path("set-password/<str:uid>/<str:token>/", SetPasswordLinkView.as_view(), name="auth-set-password-link"),
]
