import unittest

from pricewatch.money import format_price, parse_price


class MoneyTest(unittest.TestCase):
    def test_parse_price(self):
        self.assertEqual(parse_price("$1,299.00"), 129900)

    def test_format_price(self):
        self.assertEqual(format_price(1205), "12.05")
