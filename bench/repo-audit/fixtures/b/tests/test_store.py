import os
import tempfile
import unittest

from pricewatch import store


class StoreTest(unittest.TestCase):
    def test_round_trip(self):
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, "prices.json")
            store.save(path, {"u": {"target": "1", "history": [5]}})
            self.assertEqual(store.load(path)["u"]["history"], [5])

    def test_missing_file_is_empty(self):
        self.assertEqual(store.load("/nonexistent/prices.json"), {})

    def test_last_price(self):
        self.assertEqual(store.last_price({"history": [3, 2]}), 2)
