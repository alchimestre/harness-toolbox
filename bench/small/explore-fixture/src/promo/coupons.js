const COUPONS = { WELCOME: '0.29', SPRING: '2.50' };

function couponCents(code) {
  const value = COUPONS[code];
  return value ? Math.trunc(+value / 0.01) : 0;
}

module.exports = { couponCents };
