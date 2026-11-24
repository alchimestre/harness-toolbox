"""Tax rates in basis points and integer-cent tax computation."""

BASIS_POINTS_PER_UNIT = 10_000
HALF_BASIS_POINTS_PER_UNIT = BASIS_POINTS_PER_UNIT // 2

REGION_RATES_BP: dict[str, int] = {
    "US-CA": 725,
    "US-NY": 888,
    "US-TX": 625,
    "US-WA": 650,
    "FR": 2000,
    "DE": 1900,
    "GB": 2000,
    "NL": 2100,
}


def rate_for_region(region: str) -> int:
    """Return the tax rate in basis points for a region code; KeyError if unknown."""
    return REGION_RATES_BP[region]


def apply_rate(amount_cents: int, rate_bp: int) -> int:
    """Apply a basis-point rate to cents, rounding half away from zero."""
    magnitude = abs(amount_cents) * rate_bp
    rounded = (magnitude + HALF_BASIS_POINTS_PER_UNIT) // BASIS_POINTS_PER_UNIT
    return rounded if amount_cents >= 0 else -rounded


def tax_cents(amount_cents: int, region: str) -> int:
    """Return the tax owed in cents on amount_cents for a region code."""
    return apply_rate(amount_cents, rate_for_region(region))
