"""Rate limits for anonymous endpoints (sign-in, set-password links) that hold under concurrency.

DRF's own throttles read a request history from the cache, decide, then write it back. Simultaneous
requests all read the same history, so a burst gets far more than the limit through. Here the history
sits in one `ThrottleWindow` row per scope and client, read and written under `SELECT ... FOR UPDATE`
in its own committed transaction. Simultaneous requests queue on the row, every worker and instance
shares it, and no more than the limit pass in any window. The rule is DRF's: at most N requests,
successful or not, in any period of the scope's length (`DEFAULT_THROTTLE_RATES`).

The client is `REMOTE_ADDR` only, never `X-Forwarded-For`: a client chooses that header, so trusting it
would let every request claim a new address. Behind a proxy, the WSGI server sets `REMOTE_ADDR` from
the proxies it trusts (docs/deployment.md, Waitress's `--trusted-proxy`).

A view using this throttle must run outside the request transaction (`transaction.non_atomic_requests`
on `dispatch`): inside it, the error response of a refused or failed sign-in would roll the count back.
"""

from datetime import timedelta

from django.core.exceptions import ImproperlyConfigured
from django.db import DEFAULT_DB_ALIAS, transaction
from django.utils import timezone
from rest_framework.throttling import ScopedRateThrottle

from .models import ThrottleWindow

# Rows idle this long are deleted, so client addresses don't pile up.
FORGET_AFTER = timedelta(days=1)


class LockedScopedRateThrottle(ScopedRateThrottle):
    """`ScopedRateThrottle`'s scopes and rates, counted in a row-locked database row."""

    def get_ident(self, request):
        return request.META.get("REMOTE_ADDR") or "unknown"

    def allow_request(self, request, view):
        self.scope = getattr(view, self.scope_attr, None)
        if not self.scope:
            return True
        if DEFAULT_DB_ALIAS not in getattr(getattr(view, "dispatch", None), "_non_atomic_requests", ()):
            raise ImproperlyConfigured(
                f"{type(view).__name__} must use transaction.non_atomic_requests to be throttled (see throttling.py)."
            )
        self.rate = self.get_rate()
        self.num_requests, self.duration = self.parse_rate(self.rate)
        if self.rate is None:
            return True
        key = f"throttle:{self.scope}:{self.get_ident(request)}"
        with transaction.atomic():
            ThrottleWindow.objects.bulk_create([ThrottleWindow(key=key)], ignore_conflicts=True)
            window = ThrottleWindow.objects.select_for_update().get(key=key)
            # The time once the lock is held: a request that queued behind others is later than their hits.
            now = self.timer()
            hits = sorted(t for t in window.hits if t > now - self.duration)
            if len(hits) >= self.num_requests:
                self.history = list(reversed(hits))  # newest first, as DRF's wait() expects
                self.now = now
                return False
            window.hits = [*hits, now][-self.num_requests :]
            window.save(update_fields=["hits", "updated_at"])
        ThrottleWindow.objects.filter(updated_at__lt=timezone.now() - FORGET_AFTER).delete()
        return True

    def wait(self):
        # Seconds until the oldest request in the window leaves it.
        return max(0.0, self.history[-1] + self.duration - self.now)
