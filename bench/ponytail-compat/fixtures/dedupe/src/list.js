function last(items) {
  return items[items.length - 1];
}

function chunk(items, size) {
  const chunks = [];
  for (let start = 0; start < items.length; start += size) chunks.push(items.slice(start, start + size));
  return chunks;
}

module.exports = { last, chunk };
