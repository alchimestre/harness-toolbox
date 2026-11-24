"""Totals of integer cents grouped by currency code."""

from collections import defaultdict


def totals_by_currency(amounts: list[tuple[str, int]]) -> dict[str, int]:
    """Sum (currency, cents) pairs per currency code; keys come back sorted."""
    totals: defaultdict[str, int] = defaultdict(int)
    for currency, cents in amounts:
        if not isinstance(cents, int) or isinstance(cents, bool):
            raise TypeError(f"amount for {currency} must be an int number of cents")
        totals[currency] += cents
    return dict(sorted(totals.items()))


def grand_total(totals: dict[str, int]) -> int:
    """Return the sum of per-currency totals; only meaningful for one currency."""
    return sum(totals.values())


def format_total(currency: str, cents: int) -> str:
    """Render cents as a decimal amount followed by the currency code."""
    sign = "-" if cents < 0 else ""
    major, minor = divmod(abs(cents), 100)
    return f"{sign}{major}.{minor:02d} {currency}"
