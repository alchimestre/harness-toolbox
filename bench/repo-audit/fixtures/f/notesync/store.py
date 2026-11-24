"""Load and save notes as one JSON file per note."""
import json
import re
from pathlib import Path


def make_slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def load_notes(folder):
    notes = []
    for path in sorted(Path(folder).glob("*.json")):
        try:
            notes.append(json.loads(path.read_text()))
        except OSError:
            pass
    return notes


def save_note(folder, note):
    path = Path(folder) / f"{make_slug(note['title'])}.json"
    path.write_text(json.dumps(note, indent=2))
    return path


def legacy_path(folder):
    return Path(folder) / "notes.txt"
