'use strict';

function renderReport(orders) {
  const byCustomer = {};
  for (const order of orders) {
    if (!byCustomer[order.customer]) byCustomer[order.customer] = [];
    byCustomer[order.customer].push(order);
  }
  const names = Object.keys(byCustomer).sort();
  const lines = [];
  for (const name of names) {
    let total = 0;
    for (const order of byCustomer[name]) total += order.cents;
    lines.push(`${name}: ${byCustomer[name].length} orders, ${(total / 100).toFixed(2)}`);
  }
  return lines.join('\n');
}

module.exports = { renderReport };
