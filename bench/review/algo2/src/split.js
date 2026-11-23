function splitCents(total, parts) {
  const share = Math.floor(total / parts);
  const remainder = total - share * parts;
  // The remainder goes to the first shares, one cent each, so no share differs by more than a cent.
  return Array.from({ length: parts }, (_, index) => share + (index < remainder ? 1 : 0));
}

module.exports = { splitCents };
