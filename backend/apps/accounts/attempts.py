"""Attempt limits that hold under concurrency: approval PINs and Django admin sign-ins.

Each guarded thing has one `AttemptGuard` row. `reserve()` locks that row, refuses if the limit is
reached, and otherwise counts the attempt *before* the secret is checked, in its own committed
transaction. Simultaneous attempts queue on the row lock, so no more than `limit` secrets are ever
checked in a window, and a request that fails later can't roll the count back.

Call these outside the request's transaction (`transaction.non_atomic_requests` on the view): inside
it, the count would be undone with an error response, and the row lock held until the request ends.
"""

import hashlib
from dataclasses import dataclass
from datetime import timedelta

from django.db import transaction
from django.db.models import F
from django.db.models.functions import Greatest
from django.utils import timezone

from .models import AttemptGuard

# Rows idle this long are deleted, so keys such as client addresses don't pile up.
FORGET_AFTER = timedelta(days=1)


@dataclass(frozen=True)
class Reservation:
    allowed: bool
    retry_after: timedelta = timedelta(0)

    @property
    def retry_minutes(self) -> int:
        return max(1, -(-int(self.retry_after.total_seconds()) // 60))


def account_key(prefix: str, identifier: str) -> str:
    """A key for an account named by the client, without storing the name itself."""
    digest = hashlib.sha256(identifier.strip().lower().encode()).hexdigest()[:40]
    return f"{prefix}:{digest}"


def reserve(key: str, limit: int, window: timedelta) -> Reservation:
    """Count one attempt against `key`, or refuse when `limit` attempts fall within `window`.

    The window runs from the last counted attempt, so a lockout lasts `window` after the last guess.
    """
    now = timezone.now()
    with transaction.atomic():
        AttemptGuard.objects.bulk_create([AttemptGuard(key=key)], ignore_conflicts=True)
        guard = AttemptGuard.objects.select_for_update().get(key=key)
        if guard.last_attempt_at is not None and now - guard.last_attempt_at >= window:
            guard.attempts = 0
        if guard.attempts >= limit:
            return Reservation(False, guard.last_attempt_at + window - now)
        guard.attempts += 1
        guard.last_attempt_at = now
        guard.save(update_fields=["attempts", "last_attempt_at"])
    AttemptGuard.objects.filter(last_attempt_at__lt=now - FORGET_AFTER).delete()
    return Reservation(True)


def reserve_all(keys: list[tuple[str, int, timedelta]]) -> Reservation:
    """Reserve against several keys; if any refuses, give back the ones already taken."""
    taken = []
    for key, limit, window in keys:
        reservation = reserve(key, limit, window)
        if not reservation.allowed:
            for done in taken:
                release(done)
            return reservation
        taken.append(key)
    return Reservation(True)


def release(key: str) -> None:
    """Give back one reserved attempt that turned out to be legitimate."""
    AttemptGuard.objects.filter(key=key).update(attempts=Greatest(F("attempts") - 1, 0))


def clear(key: str) -> None:
    """Forget every counted attempt, e.g. after the right PIN or password."""
    AttemptGuard.objects.filter(key=key).update(attempts=0)
