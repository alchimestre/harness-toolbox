const { rawWeight: netWeight } = require('./weight');

function customsDeclaration(order) {
  return { contents: order.items.map((i) => i.name).join(', '), grossGrams: netWeight(order.items) };
}

module.exports = { customsDeclaration };
