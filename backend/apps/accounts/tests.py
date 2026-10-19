import pytest
from django.core.cache import cache
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.test import APIClient

from apps.accounts.models import Role, User


@pytest.fixture
def cashier(db):
    return User.objects.create_user(email="anjali@example.com", password="s3cret-pass", full_name="Anjali Prakash")


@pytest.fixture
def csrf_client():
    return APIClient(enforce_csrf_checks=True)


def _login(client, email, password):
    client.get("/api/v1/auth/csrf/")
    token = client.cookies["csrftoken"].value
    return client.post(
        "/api/v1/auth/login/", {"email": email, "password": password}, format="json", HTTP_X_CSRFTOKEN=token
    )


def test_login_returns_profile_and_starts_session(csrf_client, cashier):
    response = _login(csrf_client, "Anjali@Example.com", "s3cret-pass")
    assert response.status_code == 200
    assert response.json() == {
        "id": cashier.id,
        "email": "anjali@example.com",
        "full_name": "Anjali Prakash",
        "initials": "AP",
        "role": "cashier",
        "permissions": {"can_access_admin": False, "can_approve_discounts": False, "can_view_costs": False},
    }
    assert csrf_client.get("/api/v1/auth/me/").status_code == 200


def test_login_rejects_without_csrf_token(cashier):
    client = APIClient(enforce_csrf_checks=True)
    response = client.post("/api/v1/auth/login/", {"email": cashier.email, "password": "s3cret-pass"}, format="json")
    assert response.status_code == 403


@pytest.mark.parametrize("email,password", [("anjali@example.com", "wrong"), ("nobody@example.com", "s3cret-pass")])
def test_bad_credentials_use_one_message(csrf_client, cashier, email, password):
    response = _login(csrf_client, email, password)
    # 400, so it can't be mistaken for the 403 a CSRF failure or missing permission returns.
    assert response.status_code == 400
    assert response.json() == {"detail": "Email or password is incorrect.", "code": "invalid_credentials", "fields": {}}


def test_deactivated_user_cannot_log_in(csrf_client, cashier):
    cashier.is_active = False
    cashier.save()
    response = _login(csrf_client, cashier.email, "s3cret-pass")
    assert response.status_code == 400
    assert response.json()["code"] == "invalid_credentials"


def test_validation_errors_use_field_envelope(csrf_client, db):
    response = _login(csrf_client, "not-an-email", "")
    assert response.status_code == 400
    body = response.json()
    assert body["code"] == "invalid"
    assert set(body["fields"]) == {"email", "password"}


def test_me_requires_authentication(db):
    assert APIClient().get("/api/v1/auth/me/").status_code == 403


def test_logout_ends_session(csrf_client, cashier):
    _login(csrf_client, cashier.email, "s3cret-pass")
    token = csrf_client.cookies["csrftoken"].value
    assert csrf_client.post("/api/v1/auth/logout/", HTTP_X_CSRFTOKEN=token).status_code == 204
    assert csrf_client.get("/api/v1/auth/me/").status_code == 403


def test_role_permissions(db):
    admin = User.objects.create_user(email="a@example.com", password="x", full_name="Devika R.", role=Role.ADMIN)
    senior = User.objects.create_user(email="s@example.com", password="x", full_name="Rahul K", role=Role.SENIOR_CASHIER)
    assert (admin.can_access_admin, admin.can_approve_discounts, admin.can_view_costs) == (True, True, True)
    assert (senior.can_access_admin, senior.can_approve_discounts, senior.can_view_costs) == (False, True, False)
    assert admin.initials == "DR"


def test_approval_pin_is_hashed_and_validated(cashier):
    cashier.set_approval_pin("4826")
    assert "4826" not in cashier.approval_pin_hash
    assert cashier.check_approval_pin("4826")
    assert not cashier.check_approval_pin("0000")
    with pytest.raises(ValueError):
        cashier.set_approval_pin("12")


def test_session_reports_anonymous_without_an_error(db):
    client = APIClient()
    response = client.get("/api/v1/auth/session/")
    assert response.status_code == 200
    assert response.json() == {"user": None}
    assert "csrftoken" in response.cookies


def test_session_reports_the_signed_in_user(csrf_client, cashier):
    _login(csrf_client, cashier.email, "s3cret-pass")
    user = csrf_client.get("/api/v1/auth/session/").json()["user"]
    assert (user["email"], user["role"]) == ("anjali@example.com", "cashier")


def test_session_cookie_is_enough_to_log_in(cashier):
    client = APIClient(enforce_csrf_checks=True)
    client.get("/api/v1/auth/session/")
    response = client.post(
        "/api/v1/auth/login/",
        {"email": cashier.email, "password": "s3cret-pass"},
        format="json",
        HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value,
    )
    assert response.status_code == 200


def test_failed_logins_are_still_rate_limited(csrf_client, cashier, monkeypatch):
    # Test settings relax the rate; restore production's 10/min for this check.
    monkeypatch.setattr(ScopedRateThrottle, "THROTTLE_RATES", {"login": "10/min"})
    cache.clear()
    statuses = [_login(csrf_client, cashier.email, "wrong").status_code for _ in range(11)]
    assert statuses[:10] == [400] * 10
    assert statuses[10] == 429
