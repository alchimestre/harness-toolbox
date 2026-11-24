from .money import format_price
from .store import last_price


def _to_cents(value):
    cleaned = "".join(ch for ch in str(value) if ch.isdigit() or ch == ".")
    return round(float(cleaned) * 100)


def should_alert(item):
    price = last_price(item)
    return price is not None and price <= _to_cents(item["target"])


def send(url, price, channel):
    print(f"[{channel}] {url} dropped to {format_price(price)}")
