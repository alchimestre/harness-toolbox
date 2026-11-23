const RATES = { EU: '4.35', US: '9.99', UK: '6.50' };

function shippingCents(zone) {
  return ~~(RATES[zone] * 100);
}

module.exports = { shippingCents };
