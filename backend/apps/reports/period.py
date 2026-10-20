from dataclasses import dataclass
from datetime import date, timedelta

from django.utils import timezone
from rest_framework.exceptions import ValidationError

MAX_DAYS = 366
DEFAULT_DAYS = 30


@dataclass(frozen=True)
class Period:
    """Inclusive store dates."""

    start: date
    end: date

    def days(self) -> list[date]:
        return [self.start + timedelta(days=i) for i in range((self.end - self.start).days + 1)]

    def as_dict(self) -> dict:
        return {"date_from": self.start, "date_to": self.end}


def _parse(params, name: str) -> date | None:
    value = params.get(name)
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ValidationError({name: ["Enter a date as YYYY-MM-DD."]}) from exc


def parse_period(params) -> Period:
    """`date_from`/`date_to` from the query, in store dates. Missing ends default to the last 30 days."""
    today = timezone.localdate()
    end = _parse(params, "date_to")
    start = _parse(params, "date_from")
    if end is None:
        end = today if start is None else min(today, start + timedelta(days=DEFAULT_DAYS - 1))
    if start is None:
        start = end - timedelta(days=DEFAULT_DAYS - 1)
    if start > end:
        raise ValidationError({"date_to": ["The end date is before the start date."]})
    if (end - start).days + 1 > MAX_DAYS:
        raise ValidationError({"date_from": [f"Choose at most {MAX_DAYS} days."]})
    return Period(start, end)
