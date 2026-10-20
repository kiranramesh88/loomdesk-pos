"""Django's admin at /django-admin/, with sign-in attempts limited like the approval PIN.

Failed sign-ins are counted per account (5 in 15 minutes) and per client address (10 in 15 minutes)
with `apps.accounts.attempts`, before the password is checked, so simultaneous guesses can't slip past
the limit. A locked-out attempt gets the normal sign-in page with an explanation and status 429; its
password is never checked. A successful sign-in clears its account's count and is not held against the
address. The POS API's own login has its separate throttle (`LoginView`).
"""

from datetime import timedelta

from django import forms
from django.contrib import admin
from django.contrib.admin.forms import AdminAuthenticationForm
from django.contrib.auth import REDIRECT_FIELD_NAME
from django.contrib.auth.views import LoginView
from django.db import transaction
from django.utils.translation import gettext as _

from apps.accounts import attempts

ACCOUNT_ATTEMPTS = 5
ADDRESS_ATTEMPTS = 10
WINDOW = timedelta(minutes=15)


def _keys(request) -> tuple[str, str]:
    address = request.META.get("REMOTE_ADDR") or "unknown"
    return (
        f"admin-login:address:{address}",
        attempts.account_key("admin-login:account", request.POST.get("username", "")),
    )


class _LockedOutForm(AdminAuthenticationForm):
    """Shows the lockout on the sign-in page without authenticating anything."""

    lockout_message = ""

    def clean(self):
        raise forms.ValidationError(self.lockout_message, code="locked_out")


class LoomDeskAdminSite(admin.AdminSite):
    # Counts commit on their own; inside the request's transaction they'd hold the row lock until the
    # response, and the sign-in itself needs no transaction.
    @transaction.non_atomic_requests
    def login(self, request, extra_context=None):
        if request.method != "POST":
            return super().login(request, extra_context)
        address_key, account_key = _keys(request)
        reservation = attempts.reserve_all(
            [(address_key, ADDRESS_ATTEMPTS, WINDOW), (account_key, ACCOUNT_ATTEMPTS, WINDOW)]
        )
        if not reservation.allowed:
            return self._locked_out(request, reservation, extra_context)
        response = super().login(request, extra_context)
        if response.status_code in (301, 302) and request.user.is_authenticated:
            attempts.clear(account_key)
            attempts.release(address_key)
        return response

    def _locked_out(self, request, reservation, extra_context):
        minutes = reservation.retry_minutes
        message = _("Too many sign-in attempts. Try again in %(minutes)d minute%(s)s.") % {
            "minutes": minutes,
            "s": "" if minutes == 1 else "s",
        }
        form = type("LockedOutForm", (_LockedOutForm,), {"lockout_message": message})
        context = {
            **self.each_context(request),
            "title": _("Log in"),
            "subtitle": None,
            "app_path": request.get_full_path(),
            "username": request.user.get_username(),
            REDIRECT_FIELD_NAME: request.GET.get(REDIRECT_FIELD_NAME, ""),
            **(extra_context or {}),
        }
        view = LoginView.as_view(
            extra_context=context,
            authentication_form=form,
            template_name=self.login_template or "admin/login.html",
        )
        response = view(request)
        response.render()
        response.status_code = 429
        response["Retry-After"] = str(max(1, int(reservation.retry_after.total_seconds())))
        return response
