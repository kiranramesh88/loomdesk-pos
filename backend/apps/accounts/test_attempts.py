"""The row-locked attempt counter behind the approval-PIN lockout and the Django admin sign-in limit."""

from datetime import timedelta

import pytest
from django.db.models import F

from apps.accounts import attempts
from apps.accounts.models import AttemptGuard

pytestmark = pytest.mark.django_db

WINDOW = timedelta(minutes=15)


def _count(key):
    return AttemptGuard.objects.get(key=key).attempts


def test_reserve_counts_up_to_the_limit_then_refuses():
    assert all(attempts.reserve("k", 3, WINDOW).allowed for _ in range(3))
    refused = attempts.reserve("k", 3, WINDOW)
    assert not refused.allowed
    assert timedelta(minutes=14) < refused.retry_after <= WINDOW
    assert refused.retry_minutes == 15
    assert _count("k") == 3  # a refused attempt isn't counted, so it doesn't extend the lock


def test_the_window_runs_from_the_last_counted_attempt():
    for _ in range(3):
        attempts.reserve("k", 3, WINDOW)
    AttemptGuard.objects.update(last_attempt_at=F("last_attempt_at") - WINDOW)
    assert attempts.reserve("k", 3, WINDOW).allowed
    assert _count("k") == 1


def test_release_gives_back_one_attempt_and_clear_forgets_all():
    for _ in range(3):
        attempts.reserve("k", 3, WINDOW)
    attempts.release("k")
    assert _count("k") == 2
    attempts.clear("k")
    assert _count("k") == 0
    attempts.release("k")
    assert _count("k") == 0  # never below zero


def test_reserve_all_gives_back_what_it_took_when_one_key_refuses():
    for _ in range(2):
        attempts.reserve("account", 2, WINDOW)
    refused = attempts.reserve_all([("ip", 10, WINDOW), ("account", 2, WINDOW)])
    assert not refused.allowed
    assert _count("ip") == 0 and _count("account") == 2


def test_keys_are_separate_and_account_keys_hide_the_name():
    for _ in range(3):
        attempts.reserve("a", 3, WINDOW)
    assert attempts.reserve("b", 3, WINDOW).allowed
    key = attempts.account_key("admin-login:account", "  Owner@Shop.Example ")
    assert key == attempts.account_key("admin-login:account", "owner@shop.example")
    assert "owner" not in key and len(key) < 120


def test_idle_rows_are_forgotten():
    attempts.reserve("old", 3, WINDOW)
    AttemptGuard.objects.filter(key="old").update(last_attempt_at=F("last_attempt_at") - timedelta(days=2))
    attempts.reserve("new", 3, WINDOW)
    assert list(AttemptGuard.objects.values_list("key", flat=True)) == ["new"]
