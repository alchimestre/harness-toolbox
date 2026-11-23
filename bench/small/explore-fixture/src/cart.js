const { toCents, fromCents } = require('./money');

function cartTotal(lines) {
  return fromCents(lines.reduce((sum, line) => sum + toCents(line.price) * line.qty, 0));
}

module.exports = { cartTotal };
