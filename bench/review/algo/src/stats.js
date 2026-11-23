function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(p * sorted.length)];
}

module.exports = { percentile };
