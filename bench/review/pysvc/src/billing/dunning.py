"""Reminder schedule and escalation for overdue invoices."""

import datetime

REMINDER_OFFSETS_DAYS: tuple[int, ...] = (-7, 0, 7, 14, 30, 60)

MAX_ESCALATION_LEVEL = 3
LEVEL_ONE_MAX_DAYS = 30
LEVEL_TWO_MAX_DAYS = 60

LEVEL_SUBJECTS: tuple[str, ...] = (
    "Payment reminder",
    "Payment overdue",
    "Second notice",
    "Final notice",
)


def reminder_offsets() -> tuple[int, ...]:
    """Return reminder day offsets relative to the due date; negative means before it."""
    return REMINDER_OFFSETS_DAYS


def reminder_dates(due_date: datetime.date) -> list[datetime.date]:
    """Return the reminder dates for an invoice due on due_date, in ascending order."""
    return [
        due_date + datetime.timedelta(days=offset)
        for offset in sorted(REMINDER_OFFSETS_DAYS)
    ]


def next_reminder(
    due_date: datetime.date, today: datetime.date
) -> datetime.date | None:
    """Return the first reminder date on or after today, or None when none remain."""
    for reminder in reminder_dates(due_date):
        if reminder >= today:
            return reminder
    return None


def escalation_level(days_overdue: int) -> int:
    """Map days overdue to an escalation level from 0 (not overdue) to 3 (final)."""
    if days_overdue <= 0:
        return 0
    if days_overdue <= LEVEL_ONE_MAX_DAYS:
        return 1
    if days_overdue <= LEVEL_TWO_MAX_DAYS:
        return 2
    return MAX_ESCALATION_LEVEL


def format_reminder(
    invoice_id: str, due_date: datetime.date, level: int
) -> str:
    """Return the reminder text for an invoice at the given escalation level."""
    if not 0 <= level <= MAX_ESCALATION_LEVEL:
        raise ValueError(f"escalation level must be 0 to {MAX_ESCALATION_LEVEL}, got {level}")
    subject = LEVEL_SUBJECTS[level]
    due_text = due_date.isoformat()
    return f"{subject}: invoice {invoice_id} was due on {due_text}."


def reminders_due_today(
    due_date: datetime.date, today: datetime.date
) -> bool:
    """Return True when a reminder falls exactly on today."""
    return today in reminder_dates(due_date)
