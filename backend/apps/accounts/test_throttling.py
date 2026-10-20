"""The row-locked throttle on sign-in and set-password links (apps/accounts/throttling.py)."""

import threading
import time
from datetime import timedelta

import pytest
from django.core.exceptions import ImproperlyConfigured
from django.db import connection
from django.urls import URLPattern, URLResolver, get_resolver
from django.utils import timezone
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.test import APIClient, APIRequestFactory
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts.models import Role, ThrottleWindow, User
from apps.accounts.throttling import LockedScopedRateThrottle

PASSWORD = "s3cret-pass"


@pytest.fixture
def cashier(db):
    return User.objects.create_user(email="anjali@example.com", password=PASSWORD, full_name="Anjali Prakash", role=Role.CASHIER)


@pytest.fixture
def ten_a_minute(monkeypatch):
    # Test settings relax the rates; use production's.
    monkeypatch.setattr(ScopedRateThrottle, "THROTTLE_RATES", {"login": "10/min", "set_password": "10/min"})


def _client(address="203.0.113.7"):
    client = APIClient(enforce_csrf_checks=True, REMOTE_ADDR=address)
    client.get("/api/v1/auth/session/")
    return client


def _login(client, password="wrong", **extra):
    return client.post(
        "/api/v1/auth/login/",
        {"email": "anjali@example.com", "password": password},
        format="json",
        HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value,
        **extra,
    )


def _hits(scope="login", address="203.0.113.7"):
    window = ThrottleWindow.objects.filter(key=f"throttle:{scope}:{address}").first()
    return len(window.hits) if window else 0


def test_the_eleventh_attempt_in_a_minute_is_refused(cashier, ten_a_minute):
    client = _client()
    assert [_login(client).status_code for _ in range(10)] == [400] * 10
    refused = _login(client, PASSWORD)
    assert refused.status_code == 429
    assert refused.json()["code"] == "throttled"
    assert 1 <= int(refused["Retry-After"]) <= 60
    # The refused attempt's password was never checked, so the right one didn't sign in.
    assert not client.get("/api/v1/auth/session/").json()["user"]


def test_successful_sign_ins_count_too_as_before(cashier, ten_a_minute):
    client = _client()
    for _ in range(10):
        assert _login(client, PASSWORD).status_code == 200
    assert _login(client, PASSWORD).status_code == 429


def test_the_right_password_works_within_the_limit(cashier, ten_a_minute):
    client = _client()
    for _ in range(9):
        _login(client)
    response = _login(client, PASSWORD)
    assert response.status_code == 200
    assert response.json()["email"] == "anjali@example.com"


def test_the_window_slides(cashier, ten_a_minute, monkeypatch):
    clock = [1_000_000.0]
    monkeypatch.setattr(LockedScopedRateThrottle, "timer", lambda self: clock[0])
    client = _client()
    for step in range(10):
        clock[0] = 1_000_000.0 + step * 5  # one every five seconds
        _login(client)
    clock[0] = 1_000_059.0
    assert _login(client).status_code == 429
    # A minute after the first attempt, one slot frees; the next one stays taken.
    clock[0] = 1_000_060.5
    assert _login(client).status_code == 400
    assert _login(client).status_code == 429
    clock[0] = 1_000_065.5
    assert _login(client).status_code == 400


def test_a_forged_forwarded_for_header_is_not_a_new_client(cashier, ten_a_minute):
    client = _client()
    codes = [_login(client, HTTP_X_FORWARDED_FOR=f"10.0.0.{i}").status_code for i in range(11)]
    assert codes == [400] * 10 + [429]


def test_each_client_address_has_its_own_limit(cashier, ten_a_minute):
    first, second = _client("203.0.113.7"), _client("198.51.100.4")
    for _ in range(10):
        _login(first)
    assert _login(first).status_code == 429
    assert _login(second).status_code == 400


def test_retry_after_never_exceeds_the_window_even_for_a_late_stamped_hit(cashier, ten_a_minute, monkeypatch):
    clock = [2_000_000.0]
    monkeypatch.setattr(LockedScopedRateThrottle, "timer", lambda self: clock[0])
    # Hits recorded by another worker whose clock read slightly later, out of order.
    ThrottleWindow.objects.create(key="throttle:login:203.0.113.7", hits=[2_000_000.4, *[1_999_990.0 + i for i in range(9)]])
    refused = _login(_client())
    assert refused.status_code == 429
    assert int(refused["Retry-After"]) == 50  # the oldest hit (1,999,990) leaves the window at 2,000,050


def test_set_password_links_are_limited_the_same_way(db, ten_a_minute):
    client = APIClient(REMOTE_ADDR="203.0.113.7")
    codes = [client.get("/api/v1/auth/set-password/MQ/x-y/").status_code for _ in range(11)]
    assert codes == [400] * 10 + [429]
    assert _hits("set_password") == 10
    # A separate scope: the address can still sign in.
    assert _hits("login") == 0


@pytest.mark.django_db(transaction=True)
def test_failed_sign_ins_stay_counted_without_the_test_transaction(cashier, ten_a_minute):
    """As in production: each failed sign-in's error response rolls nothing back, so it stays counted."""
    client = _client()
    for _ in range(10):
        _login(client)
    assert _hits() == 10
    assert _login(client, PASSWORD).status_code == 429


def test_idle_windows_are_forgotten(cashier, ten_a_minute):
    ThrottleWindow.objects.create(key="throttle:login:192.0.2.1", hits=[1.0])
    ThrottleWindow.objects.filter(key="throttle:login:192.0.2.1").update(updated_at=timezone.now() - timedelta(days=2))
    _login(_client())
    assert not ThrottleWindow.objects.filter(key="throttle:login:192.0.2.1").exists()
    assert _hits() == 1


def test_a_throttled_view_inside_the_request_transaction_is_refused(db):
    class Careless(APIView):
        permission_classes = [AllowAny]
        throttle_classes = [LockedScopedRateThrottle]
        throttle_scope = "login"

        def get(self, request):
            return Response({})

    with pytest.raises(ImproperlyConfigured, match="non_atomic_requests"):
        Careless.as_view()(APIRequestFactory().get("/"))


def _views(patterns):
    for pattern in patterns:
        if isinstance(pattern, URLResolver):
            yield from _views(pattern.url_patterns)
        elif isinstance(pattern, URLPattern) and hasattr(pattern.callback, "cls"):
            yield pattern.callback.cls


def test_every_throttled_endpoint_uses_the_locked_throttle():
    throttled = {view for view in _views(get_resolver().url_patterns) if view.throttle_classes}
    assert {v.__name__ for v in throttled} >= {"LoginView", "SetPasswordLinkView", "SetPasswordView"}
    for view in throttled:
        assert all(issubclass(t, LockedScopedRateThrottle) for t in view.throttle_classes), view


@pytest.mark.skipif(connection.vendor != "postgresql", reason="Needs Postgres row locks and real concurrent connections")
@pytest.mark.django_db(transaction=True)
def test_simultaneous_sign_ins_cannot_exceed_the_limit(cashier, ten_a_minute, monkeypatch):
    """Twenty wrong passwords at once from one address. Saving the window is slowed so the requests
    overlap. DRF's read-then-write throttle let all twenty through (checked before this fix); with the
    row lock exactly ten are checked and ten refused."""
    real_save = ThrottleWindow.save

    def slow_save(self, *args, **kwargs):
        time.sleep(0.15)
        return real_save(self, *args, **kwargs)

    monkeypatch.setattr(ThrottleWindow, "save", slow_save)
    clients = [_client() for _ in range(20)]
    barrier = threading.Barrier(len(clients))
    codes = []

    def attempt(client):
        barrier.wait()
        codes.append(_login(client).status_code)
        connection.close()

    threads = [threading.Thread(target=attempt, args=(c,)) for c in clients]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert sorted(codes) == [400] * 10 + [429] * 10
    assert _hits() == 10
    # Each hit is stamped once its request holds the lock, so they're in order.
    hits = ThrottleWindow.objects.get(key="throttle:login:203.0.113.7").hits
    assert hits == sorted(hits)


@pytest.mark.skipif(connection.vendor != "postgresql", reason="Needs Postgres row locks and real concurrent connections")
@pytest.mark.django_db(transaction=True)
def test_simultaneous_first_requests_from_a_new_address_share_one_window(cashier, ten_a_minute):
    """The window row doesn't exist yet: simultaneous inserts must not lose counts or fail."""
    clients = [_client("192.0.2.50") for _ in range(15)]
    barrier = threading.Barrier(len(clients))
    codes = []

    def attempt(client):
        barrier.wait()
        codes.append(_login(client).status_code)
        connection.close()

    ThrottleWindow.objects.all().delete()  # the session requests above made no row; be sure
    threads = [threading.Thread(target=attempt, args=(c,)) for c in clients]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert sorted(codes) == [400] * 10 + [429] * 5
    assert _hits(address="192.0.2.50") == 10
