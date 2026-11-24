import json
import statistics
from pathlib import Path

BENCH = Path(__file__).resolve().parent.parent


def load():
    """Returns (rows by requested model, count of unusable files, corrupt file names)."""
    rows, invalid, corrupt = {}, 0, []
    for path in sorted((BENCH / "results").glob("*.json")):
        try:
            result = json.loads(path.read_text())
        except ValueError:
            invalid += 1
            corrupt.append(path.name)
            continue
        invalid += result["answered_by"] != result["requested"]
        rows.setdefault(result["requested"], []).append(result)
    return rows, invalid, corrupt


def table(rows):
    lines = ["| model:effort | runs | mean score | median secs |", "|---|---|---|---|"]
    for model, results in sorted(rows.items()):
        mean = statistics.mean(r["score"] for r in results)
        median = statistics.median(r["secs"] for r in results)
        lines.append(f"| {model} | {len(results)} | {mean:.3f} | {median:.1f} |")
    return "\n".join(lines)
