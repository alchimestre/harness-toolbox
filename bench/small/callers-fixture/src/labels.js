function labelFor(order) {
  let grams = 0;
  for (const item of order.items) grams += item.grams * item.qty;
  return { to: order.address, weight: `${grams} g` };
}

module.exports = { labelFor };
