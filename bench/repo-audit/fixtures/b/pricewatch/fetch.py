import time
import urllib.request

from .money import parse_price

REQUEST_INTERVAL_SECONDS = 1


def fetch_price(url):
    with urllib.request.urlopen(url, timeout=10) as response:
        return parse_price(response.read().decode().strip())


def fetch_all(urls):
    results = []
    for url in urls:
        results.append((url, fetch_price(url)))
        time.sleep(REQUEST_INTERVAL_SECONDS)
    return results
