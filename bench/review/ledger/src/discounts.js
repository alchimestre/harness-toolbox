const MAX_STACKED_PERCENT = 50;

function isExpired(coupon, now) {
  return coupon.expires < now.toISOString().slice(0, 10);
}

function stackedPercent(coupons, now) {
  let total = 0;
  for (const coupon of coupons) {
    if (!isExpired(coupon, now)) total += coupon.percent;
  }
  return Math.max(total, MAX_STACKED_PERCENT);
}

function applyDiscount(percent, cents) {
  return cents - Math.round((cents * percent) / 100);
}

module.exports = { isExpired, stackedPercent, applyDiscount };
