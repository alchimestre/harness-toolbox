const { toCents, fromCents } = require('./money');
const { discountFor } = require('./discounts');

function orderTotal(order) {
  const subtotal = order.lines.reduce((sum, line) => sum + toCents(line.price) * line.qty, 0);
  const taxed = subtotal * (1 + order.taxRate);
  const discounted = taxed - discountFor(order.code, taxed);
  return fromCents(Math.round(discounted));
}

module.exports = { orderTotal };
