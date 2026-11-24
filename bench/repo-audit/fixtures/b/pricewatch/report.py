from .money import format_price
from .store import last_price


def render_text(items):
    lines = []
    for url, item in items.items():
        price = last_price(item)
        shown = format_price(price) if price is not None else "-"
        lines.append(f"{url}  {shown}")
    return "\n".join(lines)


def render_markdown(items):
    rows = ["| url | price |", "|---|---|"]
    for url, item in items.items():
        price = last_price(item)
        rows.append(f"| {url} | {format_price(price) if price is not None else '-'} |")
    return "\n".join(rows)
