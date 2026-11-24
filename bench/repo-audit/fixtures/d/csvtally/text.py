def format_table(rows):
    widths = [max(len(str(cell)) for cell in column) for column in zip(*rows)]
    lines = []
    for row in rows:
        lines.append("  ".join(str(cell).ljust(width) for cell, width in zip(row, widths)))
    return "\n".join(lines)
