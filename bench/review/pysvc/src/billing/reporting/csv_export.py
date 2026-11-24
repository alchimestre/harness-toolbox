"""Render invoice rows as CSV text."""

import csv
import io


def column_names(rows: list[dict[str, object]]) -> list[str]:
    """Return the column names of the first row, in insertion order."""
    if not rows:
        return []
    return list(rows[0].keys())


def rows_to_csv(
    rows: list[dict[str, object]], fieldnames: list[str] | None = None
) -> str:
    """Render rows as CSV with a header line, using fieldnames or the first row's keys."""
    columns = fieldnames if fieldnames is not None else column_names(rows)
    if not columns:
        return ""
    buffer = io.StringIO()
    writer = csv.DictWriter(
        buffer,
        fieldnames=columns,
        extrasaction="ignore",
        lineterminator="\n",
    )
    writer.writeheader()
    writer.writerows(rows)
    return buffer.getvalue()
