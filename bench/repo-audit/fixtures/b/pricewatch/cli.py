import argparse

from . import alerts, fetch, report, store


def build_parser():
    parser = argparse.ArgumentParser(prog="pricewatch")
    commands = parser.add_subparsers(dest="command", required=True)
    add = commands.add_parser("add")
    add.add_argument("url")
    add.add_argument("--target", required=True)
    commands.add_parser("list")
    check = commands.add_parser("check")
    check.add_argument("--alert", choices=["email", "stdout"], default="stdout")
    return parser


def run(args, path):
    items = store.load(path)
    if args.command == "add":
        items[args.url] = {"target": args.target, "history": []}
        store.save(path, items)
    elif args.command == "list":
        print(report.render_text(items))
    elif args.command == "check":
        for url, price in fetch.fetch_all(list(items)):
            items[url]["history"].append(price)
            if alerts.should_alert(items[url]):
                alerts.send(url, price, args.alert)
        store.save(path, items)
    return 0


def main(argv, path="prices.json"):
    args = build_parser().parse_args(argv)
    try:
        return run(args, path)
    except Exception as err:
        print(f"pricewatch: {err}")
        return 2
