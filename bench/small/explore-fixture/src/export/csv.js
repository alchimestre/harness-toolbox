function render(orders) {
  return orders.map((order) => `${order.id},${parseInt(parseFloat(order.price) * 100, 10)}`).join('\n');
}

module.exports = { render };
