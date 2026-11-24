function normalizeHeaders(raw) {
  const result = {};
  for (const [name, value] of Object.entries(raw)) result[name.toLowerCase()] = String(value);
  return result;
}

module.exports = { normalizeHeaders };
