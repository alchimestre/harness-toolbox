# notesync

Keeps a folder of JSON notes in step with Markdown output.

## Install

    pip install -e .

## Commands

| Command | What it does |
|---|---|
| `notesync list <source>` | Print notes as Markdown |
| `notesync sync <source> <target>` | Copy notes into the target folder |
| `notesync prune <source>` | Delete notes older than 90 days |

`sync` accepts `--dry-run` to print the count without writing.

## Python

    from notesync import load_notes

Run tests with `pytest`.
