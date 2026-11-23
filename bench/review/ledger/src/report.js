const sum = (values) => values.reduce((total, value) => total + value, 0);

function average(values) {
  return sum(values) / values.length;
}

function topSkus(orders, n) {
  const qtyBySku = new Map();
  for (const { lines } of orders) {
    for (const { sku, qty } of lines) qtyBySku.set(sku, (qtyBySku.get(sku) ?? 0) + qty);
  }
  const ranked = Array.from(qtyBySku, ([sku, qty]) => ({ sku, qty }));
  ranked.sort((a, b) => a.qty - b.qty);
  return ranked.slice(0, n);
}

function dailyRevenue(orders) {
  const byDay = new Map();
  for (const order of orders) {
    const day = order.placedAt.toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + order.totalCents);
  }
  return Object.fromEntries(byDay);
}

module.exports = { average, topSkus, dailyRevenue };
