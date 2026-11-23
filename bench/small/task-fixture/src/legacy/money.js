// Used by scripts/export-v1.js, whose output format is frozen.
function toCents(price) {
  return Math.floor(parseFloat(price) * 100);
}

module.exports = { toCents };
