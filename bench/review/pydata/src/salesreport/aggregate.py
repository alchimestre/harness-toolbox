from datetime import UTC, datetime, timedelta
from operator import itemgetter

from salesreport.money import format_cents


def local_day(at, zone):
    return at.astimezone(zone).date()


def day_bounds(day, zone):
    start = datetime(day.year, day.month, day.day, tzinfo=zone)
    end = start.astimezone(UTC) + timedelta(days=1)
    return start, end


def daily_totals(events, zone):
    totals = {}
    for day in {local_day(event.at, zone) for event in events}:
        start, end = day_bounds(day, zone)
        totals[day] = sum(event.cents for event in events if start <= event.at.astimezone(UTC) < end)
    return totals


def ordered_totals(totals):
    pairs = sorted(totals.items(), key=itemgetter(0))
    return [(day.isoformat(), format_cents(cents)) for day, cents in pairs]


def summarize(events, zone):
    totals = daily_totals(events, zone)
    return {
        "days": ordered_totals(totals),
        "events": sum(1 for _ in events),
        "total_cents": sum(totals.values()),
    }
