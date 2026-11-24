const { parcelWeight } = require('./weight');

const CENTS_PER_100G = 12;

function shippingCents(items) {
  return Math.ceil(parcelWeight(items) / 100) * CENTS_PER_100G;
}

module.exports = { shippingCents };
