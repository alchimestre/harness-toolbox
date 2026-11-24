export type CsvRow = Record<string, string | number | boolean | null>;

export function toCsv(rows: CsvRow[], columns: string[]): string {
  const header = columns.map(escapeCell).join(',');
  const body = rows.map((row) => columns.map((column) => escapeCell(row[column] ?? '')).join(','));
  return [header, ...body].join('\n') + '\n';
}

export function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted) {
      if (character === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        current += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      cells.push(current);
      current = '';
    } else {
      current += character;
    }
  }
  cells.push(current);
  return cells;
}

function escapeCell(value: string | number | boolean | null): string {
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}
