from csvtally.dedupe import dedupe_rows


def test_dedupe_keeps_first_row_per_key():
    rows = [["id", "email"], ["1", "a@x"], ["2", "A@x"]]
    assert dedupe_rows(rows, 1) == [["id", "email"], ["1", "a@x"]]
