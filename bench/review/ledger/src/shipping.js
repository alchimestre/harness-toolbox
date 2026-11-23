const FREE_SHIPPING_ABOVE_CENTS = 10000;

const BANDS = Object.freeze([
  { maxGrams: 1000, cents: 490 },
  { maxGrams: 5000, cents: 990 },
  { maxGrams: 30000, cents: 1990 },
]);

function shippingCents(order) {
  if (order.subtotal >= FREE_SHIPPING_ABOVE_CENTS) return 0;
  const grams = order.lines.reduce((sum, line) => sum + line.grams * line.qty, 0);
  const band = BANDS.find((candidate) => grams <= candidate.maxGrams);
  if (!band) throw new Error(`too heavy: ${grams} g`);
  return band.cents;
}

module.exports = { shippingCents };
