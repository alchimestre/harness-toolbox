import argparse

from csvtally.count import count_by
from csvtally.dedupe import dedupe_rows
from csvtally.reader import read_rows


def run_count(args):
    rows = read_rows(args.path, sep=args.sep)
    index = rows[0].index(args.by)
    for value, total in count_by(rows[1:], index):
        print(f"{value}\t{total}")
    return 0


def run_dedupe(args):
    rows = read_rows(args.path, sep=args.sep)
    index = rows[0].index(args.key)
    for row in dedupe_rows(rows, index):
        print(",".join(row))
    return 0


HANDLERS = {"count": run_count, "dedupe": run_dedupe}


def build_parser():
    parser = argparse.ArgumentParser(prog="csvtally")
    commands = parser.add_subparsers(dest="command", required=True)
    count = commands.add_parser("count")
    count.add_argument("path")
    count.add_argument("--by", required=True)
    count.add_argument("--sep", default=",")
    dedupe = commands.add_parser("dedupe")
    dedupe.add_argument("path")
    dedupe.add_argument("--key", required=True)
    dedupe.add_argument("--sep", default=",")
    return parser


def main(argv):
    args = build_parser().parse_args(argv)
    return HANDLERS[args.command](args)
