const { toCents, formatCents } = require('./money');
const { stackedPercent, applyDiscount } = require('./discounts');
const { OutOfStock } = require('./inventory');
const { shippingCents } = require('./shipping');
const payments = require('./payments');

function priceLines(catalog, cart) {
  return cart.map(({ sku, qty }) => {
    const product = catalog[sku];
    if (!product) throw new Error(`unknown sku: ${sku}`);
    return { sku, qty, grams: product.grams, priceCents: toCents(product.price) };
  });
}

async function placeOrder({ catalog, inventory, gateway, cart, coupons, now = new Date() }) {
  const lines = priceLines(catalog, cart);
  let reservation;
  try {
    reservation = inventory.reserve(lines);
  } catch (err) {
    if (err instanceof OutOfStock) return { ok: false, reason: `${err.sku} is out of stock` };
    throw err;
  }
  const subtotalCents = lines.reduce((total, line) => total + line.priceCents * line.qty, 0);
  const discountedCents = applyDiscount(subtotalCents, stackedPercent(coupons, now));
  const order = {
    id: `ord_${now.getTime()}`,
    lines,
    discountedCents,
    totalCents: discountedCents + shippingCents({ lines, discountedCents }),
  };
  try {
    order.chargeId = (await payments.charge(gateway, order)).id;
  } catch (err) {
    inventory.release(reservation);
    return { ok: false, reason: `payment failed: ${err.message}` };
  }
  return { ok: true, order, summary: `${order.id}: ${formatCents(order.totalCents)}` };
}

module.exports = { placeOrder, priceLines };
