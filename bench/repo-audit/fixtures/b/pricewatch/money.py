import re

CENTS_PER_UNIT = 100


def parse_price(text):
    digits = re.sub(r"[^\d.]", "", text)
    return round(float(digits) * CENTS_PER_UNIT)


def format_price(cents):
    return f"{cents // CENTS_PER_UNIT}.{cents % CENTS_PER_UNIT:02d}"


def convert(cents, rate):
    return round(cents * rate)
