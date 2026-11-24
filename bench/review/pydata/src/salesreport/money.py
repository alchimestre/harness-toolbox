def to_cents(amount):
    return int(amount * 100)


def format_cents(cents):
    whole, fraction = divmod(abs(cents), 100)
    sign = "-" if cents < 0 else ""
    return sign + f"{whole:,}.{fraction:02d}"
