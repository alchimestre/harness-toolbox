import json
from pathlib import Path

JOURNAL_PATH = "jobs.journal.jsonl"


def record(entry):
    with Path(JOURNAL_PATH).open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry) + "\n")
