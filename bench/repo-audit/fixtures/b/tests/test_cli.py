import contextlib
import io
import os
import tempfile
import unittest

from pricewatch.cli import main


class CliTest(unittest.TestCase):
    def test_add_then_list(self):
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, "prices.json")
            self.assertEqual(main(["add", "http://x/1", "--target", "5"], path), 0)
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                self.assertEqual(main(["list"], path), 0)
            self.assertIn("http://x/1  -", out.getvalue())
