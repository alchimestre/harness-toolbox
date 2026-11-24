"""Display formatting for cent amounts and fractions."""

CENTS_PER_UNIT = 100
CENT_DIGITS = 2
PERCENT_DECIMALS = 1
PERCENT_SCALE = 100


def format_cents(cents: int) -> str:
    sign = "-" if cents < 0 else ""
    units, remainder = divmod(abs(cents), CENTS_PER_UNIT)
    return f"{sign}{units:,}.{remainder:0{CENT_DIGITS}d}"


def format_fraction_as_percent(fraction: float) -> str:
    percent = fraction * PERCENT_SCALE
    return f"{percent:.{PERCENT_DECIMALS}f}%"


def format_cents_table(rows: list[tuple[str, int]]) -> str:
    if not rows:
        return ""
    label_width = max(len(label) for label, _ in rows)
    lines = [f"{label:<{label_width}}  {format_cents(cents):>15}" for label, cents in rows]
    return "\n".join(lines)


def format_share(part: int, whole: int) -> str:
    if whole == 0:
        return format_fraction_as_percent(0.0)
    return format_fraction_as_percent(part / whole)
