import csv
import io
from datetime import date, datetime

from django.utils import timezone

UNITS = {"money": " (₹)", "percent": " (%)"}
# A cell starting with one of these is read as a formula by spreadsheet apps.
FORMULA_START = ("=", "+", "-", "@", "\t", "\r")


def _cell(value, kind: str) -> str:
    if value is None:
        return ""
    if kind == "money":
        sign = "-" if value < 0 else ""
        return f"{sign}{abs(value) // 100}.{abs(value) % 100:02d}"
    if kind == "percent":
        return f"{value / 100:.2f}"
    if kind == "count":
        return str(value)
    if isinstance(value, datetime):
        return timezone.localtime(value).strftime("%Y-%m-%d %H:%M")
    if isinstance(value, date):
        return value.isoformat()
    text = str(value)
    # Numbers are written by the branches above, so any text that looks like a formula is quoted.
    return f"'{text}" if text.startswith(FORMULA_START) else text


def to_csv(report: dict) -> str:
    """The report's table as CSV, money in rupees with two decimals. Starts with a BOM so Excel reads UTF-8."""
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\r\n")
    columns = report["columns"]
    writer.writerow([c["label"] + UNITS.get(c["kind"], "") for c in columns])
    for row in report["rows"]:
        writer.writerow([_cell(row.get(c["key"]), c["kind"]) for c in columns])
    return "﻿" + out.getvalue()


def filename(report: dict) -> str:
    period = report["period"]
    when = f"{period['date_from']}-to-{period['date_to']}" if period else timezone.localdate().isoformat()
    return f"loomdesk-{report['key']}-{when}.csv"
