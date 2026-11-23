function exportOrders(format, orders) {
  return require(`./export/${format}`).render(orders);
}

module.exports = { exportOrders };
