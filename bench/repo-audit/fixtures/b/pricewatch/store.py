import json


def load(path):
    try:
        with open(path) as handle:
            return json.load(handle)
    except FileNotFoundError:
        return {}


def save(path, items):
    try:
        with open(path, "w") as handle:
            json.dump(items, handle, indent=2)
    except OSError:
        pass


def last_price(item):
    return item["history"][-1] if item["history"] else None
