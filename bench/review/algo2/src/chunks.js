function chunk(items, size) {
  const chunks = [];
  let start = 0;
  for (; start < items.length - size; start += size) chunks.push(items.slice(start, start + size));
  if (start < items.length - 1) chunks.push(items.slice(start));
  return chunks;
}

module.exports = { chunk };
