"""Invoice aging buckets measured in days past due."""

import datetime

BUCKET_0_30 = "0-30"
BUCKET_31_60 = "31-60"
BUCKET_61_90 = "61-90"
BUCKET_90_PLUS = "90+"

BUCKET_LABELS = (BUCKET_0_30, BUCKET_31_60, BUCKET_61_90, BUCKET_90_PLUS)

MAX_CURRENT_DAYS = 30
MAX_SECOND_BUCKET_DAYS = 60
MAX_THIRD_BUCKET_DAYS = 90


def days_outstanding(due_date: datetime.date, today: datetime.date) -> int:
    """Return whole days between the due date and today; negative when not yet due."""
    return (today - due_date).days


def bucket_for_days(days: int) -> str:
    """Map a count of days past due to its aging bucket label."""
    if days <= MAX_CURRENT_DAYS:
        return BUCKET_0_30
    if days <= MAX_SECOND_BUCKET_DAYS:
        return BUCKET_31_60
    if days <= MAX_THIRD_BUCKET_DAYS:
        return BUCKET_61_90
    return BUCKET_90_PLUS


def aging_bucket(due_date: datetime.date, today: datetime.date) -> str:
    """Return the aging bucket label for an invoice due on due_date, as of today."""
    return bucket_for_days(days_outstanding(due_date, today))


def bucket_counts(
    due_dates: list[datetime.date], today: datetime.date
) -> dict[str, int]:
    """Count invoices per aging bucket, with every bucket present in the result."""
    counts = {label: 0 for label in BUCKET_LABELS}
    for due_date in due_dates:
        counts[aging_bucket(due_date, today)] += 1
    return counts
