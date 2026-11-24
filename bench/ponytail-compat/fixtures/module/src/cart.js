const { applyDiscount } = require('./discount');

function checkout(items, code) {
  const total = items.reduce((sum, item) => sum + item.cents, 0);
  return applyDiscount(total, code);
}

module.exports = { checkout };
