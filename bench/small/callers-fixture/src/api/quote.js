const weight = require('../weight');

function quote(order) {
  return { id: order.id, grams: weight.rawWeight(order.items) };
}

module.exports = { quote };
