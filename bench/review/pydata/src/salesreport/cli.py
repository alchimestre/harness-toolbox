import argparse
import sys
from zoneinfo import ZoneInfo

from salesreport.config import DEFAULT_PER_PAGE, DEFAULT_ZONE, MAX_PAGE_SIZE
from salesreport.export import render_rows, summary_for
from salesreport.ingest import load_lines
from salesreport.paginate import page_count, page_slice


def build_parser():
    parser = argparse.ArgumentParser(prog="salesreport")
    parser.add_argument("csv_path")
    parser.add_argument("--zone", default=DEFAULT_ZONE)
    parser.add_argument("--page", type=int, default=1)
    parser.add_argument("--per-page", type=int, default=DEFAULT_PER_PAGE)
    return parser


def checked_page_size(value):
    return min(value, MAX_PAGE_SIZE)


def main(argv=None, out=sys.stdout):
    args = build_parser().parse_args(argv)
    summary = summary_for(load_lines(args.csv_path), ZoneInfo(args.zone))
    per_page = checked_page_size(args.per_page)
    rows, more = page_slice(summary["days"], args.page, per_page)
    for line in render_rows(rows):
        print(line, file=out)
    pages = page_count(len(summary["days"]), per_page)
    print(f"page {args.page} of {pages}; events {summary['events']}; more={more}", file=out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
