"""Calendar quarter helpers."""

import calendar
import datetime

MONTHS_PER_QUARTER = 3
QUARTERS_PER_YEAR = 4


def quarter_number(day: datetime.date) -> int:
    return (day.month - 1) // MONTHS_PER_QUARTER + 1


def quarter_label(day: datetime.date) -> str:
    return f"Q{quarter_number(day)} {day.year}"


def quarter_start(day: datetime.date) -> datetime.date:
    first_month = (quarter_number(day) - 1) * MONTHS_PER_QUARTER + 1
    return datetime.date(day.year, first_month, 1)


def quarter_end(day: datetime.date) -> datetime.date:
    last_month = quarter_number(day) * MONTHS_PER_QUARTER
    last_day = calendar.monthrange(day.year, last_month)[1]
    return datetime.date(day.year, last_month, last_day)


def quarter_bounds(day: datetime.date) -> tuple[datetime.date, datetime.date]:
    return quarter_start(day), quarter_end(day)


def quarters_in_year(year: int) -> list[str]:
    return [f"Q{number} {year}" for number in range(1, QUARTERS_PER_YEAR + 1)]
