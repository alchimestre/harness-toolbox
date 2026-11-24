import csv


def read_rows(path, sep=","):
    rows = []
    with open(path, newline="", encoding="utf-8") as handle:
        try:
            for row in csv.reader(handle, delimiter=sep):
                if not row:
                    continue
                rows.append(row)
        except csv.Error:
            pass
    return rows
