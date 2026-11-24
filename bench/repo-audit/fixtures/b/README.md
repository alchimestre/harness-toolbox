# pricewatch

Track product prices in a JSON file and flag drops below a target.

## Usage

```
python -m pricewatch add https://shop.example/item/42 --target 9.99
python -m pricewatch list
python -m pricewatch check --notify email
python -m pricewatch prune --older-than 30
```

`check` fetches each tracked URL once per second and appends the price to its history.

| Command | Meaning |
|---|---|
| `add <url> --target <price>` | Start tracking a URL |
| `list` | Print tracked items with their last price |
| `check [--notify email]` | Fetch prices and report drops |
| `prune --older-than <days>` | Delete history older than the cutoff |

## Library

```python
from pricewatch import parse_price
parse_price("$1,299.00")  # 129900 (cents)
```

## Development

```
make test
```
