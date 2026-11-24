export function formatTable(rows, columns) {
  const widths = columns.map((column) =>
    Math.max(column.length, ...rows.map((row) => String(row[column] ?? '').length)),
  );
  const header = columns.map((column, index) => column.padEnd(widths[index])).join('  ');
  const rule = widths.map((width) => '-'.repeat(width)).join('  ');
  const body = rows.map((row) =>
    columns.map((column, index) => String(row[column] ?? '').padEnd(widths[index])).join('  '),
  );
  return [header, rule, ...body].join('\n');
}

export function formatKeyValues(record) {
  const keys = Object.keys(record);
  const width = Math.max(0, ...keys.map((key) => key.length));
  return keys.map((key) => `${key.padEnd(width)}  ${record[key]}`).join('\n');
}

export function indent(text, spaces = 2) {
  const pad = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((line) => (line.length > 0 ? pad + line : line))
    .join('\n');
}
