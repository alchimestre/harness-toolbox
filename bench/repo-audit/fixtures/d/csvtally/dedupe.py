def _clean_key(value):
    return value.strip().lower()


def dedupe_rows(rows, index):
    seen = set()
    kept = []
    for row in rows:
        key = _clean_key(row[index])
        if key in seen:
            continue
        seen.add(key)
        kept.append(row)
    return kept
