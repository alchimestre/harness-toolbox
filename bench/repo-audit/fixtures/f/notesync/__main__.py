"""Command line entry point."""
import argparse
import sys

from notesync.render import render_markdown
from notesync.store import load_notes, save_note


def build_parser():
    parser = argparse.ArgumentParser(prog="notesync")
    commands = parser.add_subparsers(dest="command", required=True)
    listing = commands.add_parser("list", help="Print notes as Markdown")
    listing.add_argument("source")
    sync = commands.add_parser("sync", help="Copy notes into the target folder")
    sync.add_argument("source")
    sync.add_argument("target")
    sync.add_argument("--preview", action="store_true")
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    notes = load_notes(args.source)
    if args.command == "list":
        sys.stdout.write("\n".join(render_markdown(note) for note in notes))
        return 0
    if args.preview:
        print(f"would sync {len(notes)} notes")
        return 0
    for note in notes:
        save_note(args.target, note)
    return 0


if __name__ == "__main__":
    sys.exit(main())
