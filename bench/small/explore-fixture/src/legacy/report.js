function reportLine(order) {
  return `${order.id};${Math.floor(parseFloat(order.price) * 100)}`;
}

module.exports = { reportLine };
