const path = require('node:path');

const root = path.resolve(process.argv[2]);
const load = (file) => require(path.join(root, file));
const checks = [
  ['cart', () => load('src/cart').cartTotal([{ price: '0.57', qty: 3 }]) === '1.71'],
  ['refunds', () => load('src/billing/refunds').refundCents({ price: '1.13', qty: 2 }) === 226],
  ['csv export', () => load('src/exporters').exportOrders('csv', [{ id: 1, price: '0.57' }]) === '1,57'],
  ['shipping', () => load('src/shipping/rates').shippingCents('EU') === 435],
  ['coupons', () => load('src/promo/coupons').couponCents('WELCOME') === 29],
  ['vat', () => load('src/tax/vat').vatBaseCents('1.15') === 115],
  ['gift cards', () => load('src/gift/cards').giftBalanceCents({ balance: '8.20' }) === 820],
  ['percent floored', () => load('src/stats').percentPaid(999, 1000) === '99%'],
  ['progress floored', () => load('src/progress').progressPercent(999, 1000) === 99],
];
let passed = 0;
for (const [name, check] of checks) {
  let ok = false;
  try { ok = check(); } catch {}
  if (!ok) console.error(`fail: ${name}`);
  passed += ok;
}
console.log(`${passed}/${checks.length}`);
process.exit(passed === checks.length ? 0 : 1);
