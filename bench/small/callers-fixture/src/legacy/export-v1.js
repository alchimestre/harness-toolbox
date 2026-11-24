const { rawWeight } = require('../weight');

function exportRow(order) {
  return `${order.id};${rawWeight(order.items)}`;
}

module.exports = { exportRow };
