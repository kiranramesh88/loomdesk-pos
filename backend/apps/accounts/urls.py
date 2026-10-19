from django.urls import path

from .views import CsrfView, LoginView, LogoutView, MeView, SessionView

urlpatterns = [
    path("csrf/", CsrfView.as_view(), name="auth-csrf"),
    path("login/", LoginView.as_view(), name="auth-login"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
    path("me/", MeView.as_view(), name="auth-me"),
    path("session/", SessionView.as_view(), name="auth-session"),
]
