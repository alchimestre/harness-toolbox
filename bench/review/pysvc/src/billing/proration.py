def unused_fraction(period_start, period_end, at):
    total = (period_end - period_start).total_seconds()
    remaining = (period_end - at).total_seconds()
    return max(min(remaining / total, 1.0), 0.0)


def prorated_cents(amount_cents, at, period_start, period_end):
    fraction = unused_fraction(period_start, period_end, at)
    return round(amount_cents * fraction)
