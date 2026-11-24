from collections import Counter


def normalise_key(value):
    return value.strip().lower()


def count_by(rows, index):
    counts = Counter(normalise_key(row[index]) for row in rows)
    return counts.most_common()


def total_rows(counts):
    return sum(count for _, count in counts)
