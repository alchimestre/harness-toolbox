const { sumBy } = require('../util/collections');

function dailySummary(orders) {
  const totalGrams = orders.reduce((sum, order) => sum + sumBy(order.items, (i) => i.grams * i.qty), 0);
  return { orders: orders.length, totalGrams };
}

module.exports = { dailySummary };
