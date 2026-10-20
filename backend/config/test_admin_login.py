"""Sign-in limits on Django's admin at /django-admin/ (config/admin_site.py)."""

from datetime import timedelta
from unittest import mock

import pytest
from django.contrib.auth.backends import ModelBackend
from django.db.models import F
from django.test import Client

from apps.accounts.models import AttemptGuard, Role, User

pytestmark = pytest.mark.django_db

LOGIN = "/django-admin/login/"
PASSWORD = "Admin-Sign-In-2026!"


@pytest.fixture
def superuser():
    return User.objects.create_superuser(email="root@shop.example", password=PASSWORD, full_name="Site Root")


def _sign_in(email, password, address="10.0.0.1", client=None):
    client = client or Client()
    return client.post(LOGIN, {"username": email, "password": password, "next": "/django-admin/"}, REMOTE_ADDR=address)


def _locked(response):
    return response.status_code == 429 and b"Too many sign-in attempts" in response.content


def test_the_admin_still_signs_in(superuser):
    client = Client()
    assert client.get(LOGIN).status_code == 200
    response = _sign_in(superuser.email, PASSWORD, client=client)
    assert response.status_code == 302 and response["Location"] == "/django-admin/"
    assert client.get("/django-admin/").status_code == 200


def test_five_wrong_passwords_lock_the_account_without_checking_more(superuser):
    with mock.patch.object(ModelBackend, "authenticate", autospec=True, side_effect=ModelBackend.authenticate) as checked:
        for _ in range(5):
            assert _sign_in(superuser.email, "wrong-password").status_code == 200
        assert checked.call_count == 5
        locked_client = Client()
        response = _sign_in(superuser.email, PASSWORD, client=locked_client)
    assert _locked(response)
    assert response["Retry-After"] and int(response["Retry-After"]) <= 15 * 60
    assert b"Try again in 15 minutes." in response.content
    assert checked.call_count == 5  # the locked-out password isn't even tried
    assert "_auth_user_id" not in locked_client.session  # not signed in
    # From another address too: the account is what's locked.
    assert _locked(_sign_in(superuser.email.upper(), PASSWORD, address="10.0.0.9"))


def test_the_account_lock_ends_after_15_minutes(superuser):
    for _ in range(5):
        _sign_in(superuser.email, "wrong-password")
    AttemptGuard.objects.update(last_attempt_at=F("last_attempt_at") - timedelta(minutes=15))
    assert _sign_in(superuser.email, PASSWORD).status_code == 302


def test_one_address_trying_many_accounts_is_limited(superuser):
    for i in range(10):
        assert _sign_in(f"guess{i}@shop.example", "wrong-password").status_code == 200
    assert _locked(_sign_in(superuser.email, PASSWORD))
    # Another address can still sign in to the same account.
    assert _sign_in(superuser.email, PASSWORD, address="10.0.0.2").status_code == 302


def test_successful_sign_ins_are_not_held_against_anyone(superuser):
    for _ in range(4):
        _sign_in(superuser.email, "wrong-password")
    assert _sign_in(superuser.email, PASSWORD).status_code == 302  # clears the account's count
    for _ in range(12):
        assert _sign_in(superuser.email, PASSWORD).status_code == 302  # and never fills the address's
    for _ in range(5):
        assert _sign_in(superuser.email, "wrong-password").status_code == 200
    assert _locked(_sign_in(superuser.email, PASSWORD))


def test_a_store_account_without_admin_access_counts_as_a_failure():
    User.objects.create_user(email="till@shop.example", password=PASSWORD, full_name="Till", role=Role.ADMIN)
    for _ in range(5):
        response = _sign_in("till@shop.example", PASSWORD)
        assert response.status_code == 200 and b"staff account" in response.content
    assert _locked(_sign_in("till@shop.example", PASSWORD))


def test_counts_hold_no_email_addresses(superuser):
    _sign_in(superuser.email, "wrong-password")
    assert not any("root" in key or "@" in key for key in AttemptGuard.objects.values_list("key", flat=True))
