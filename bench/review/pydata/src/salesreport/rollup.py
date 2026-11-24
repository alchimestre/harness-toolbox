"""Weekly rollups of dated cent amounts, keyed by ISO year and ISO week."""

import datetime
from collections.abc import Iterable

ISO_MONDAY = 1


def week_key(day: datetime.date) -> tuple[int, int]:
    iso_year, iso_week, _ = day.isocalendar()
    return iso_year, iso_week


def add_to_weekly_totals(
    totals: dict[tuple[int, int], int],
    day: datetime.date,
    cents: int,
) -> None:
    key = week_key(day)
    totals[key] = totals.get(key, 0) + cents


def weekly_totals(
    entries: Iterable[tuple[datetime.date, int]],
) -> list[tuple[int, int, int]]:
    totals: dict[tuple[int, int], int] = {}
    for day, cents in entries:
        add_to_weekly_totals(totals, day, cents)
    return [
        (iso_year, iso_week, total)
        for (iso_year, iso_week), total in sorted(totals.items())
    ]


def week_monday(iso_year: int, iso_week: int) -> datetime.date:
    return datetime.date.fromisocalendar(iso_year, iso_week, ISO_MONDAY)
