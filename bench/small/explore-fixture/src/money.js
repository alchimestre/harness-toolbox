function toCents(price) {
  return Math.floor(parseFloat(price) * 100);
}

function fromCents(cents) {
  return (cents / 100).toFixed(2);
}

module.exports = { toCents, fromCents };
