"""Region codes, display names and per-region cent totals."""

from collections.abc import Iterable

REGION_NAMES: dict[str, str] = {
    "NA": "North America",
    "LATAM": "Latin America",
    "UKI": "United Kingdom and Ireland",
    "DACH": "Germany, Austria and Switzerland",
    "FR": "France",
    "IBERIA": "Spain and Portugal",
    "ITALY": "Italy",
    "BENELUX": "Belgium, Netherlands and Luxembourg",
    "NORDICS": "Nordic Countries",
    "CEE": "Central and Eastern Europe",
    "MEA": "Middle East and Africa",
    "INDIA": "India",
    "SEA": "Southeast Asia",
    "JAPAN": "Japan",
    "KOREA": "South Korea",
    "GREATER_CHINA": "Greater China",
    "ANZ": "Australia and New Zealand",
    "OTHER": "Other Regions",
}

UNKNOWN_REGION_MESSAGE = "unknown region code: {code!r}"


def region_name(code: str) -> str:
    normalized = code.strip().upper()
    if normalized not in REGION_NAMES:
        raise ValueError(UNKNOWN_REGION_MESSAGE.format(code=code))
    return REGION_NAMES[normalized]


def is_known_region(code: str) -> bool:
    return code.strip().upper() in REGION_NAMES


def totals_by_region(pairs: Iterable[tuple[str, int]]) -> dict[str, int]:
    totals: dict[str, int] = {}
    for code, cents in pairs:
        name = region_name(code)
        totals[name] = totals.get(name, 0) + cents
    return totals


def sorted_region_totals(pairs: Iterable[tuple[str, int]]) -> list[tuple[str, int]]:
    totals = totals_by_region(pairs)
    return sorted(totals.items(), key=lambda item: (-item[1], item[0]))
