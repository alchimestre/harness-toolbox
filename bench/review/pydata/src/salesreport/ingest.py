import csv
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from salesreport.money import to_cents

REQUIRED_COLUMNS = ("store", "at", "amount")


@dataclass(slots=True)
class Event:
    store: str
    at: datetime
    cents: int


def normalize_timestamp(raw):
    return datetime.fromisoformat(raw.strip())


def parse_event(row):
    return Event(
        store=row["store"].strip(),
        at=normalize_timestamp(row["at"]),
        cents=to_cents(float(row["amount"])),
    )


def parse_rows(lines):
    reader = csv.DictReader(lines)
    missing = [column for column in REQUIRED_COLUMNS if column not in (reader.fieldnames or [])]
    if missing:
        raise ValueError(f"missing columns: {', '.join(missing)}")
    for row in reader:
        yield parse_event(row)


def load_lines(path):
    return Path(path).read_text(encoding="utf-8").splitlines()
