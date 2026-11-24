// Hidden cases for the callers fixture; never copied into the workspace.
const path = require('node:path');

const root = path.resolve(process.argv[2]);
const load = (file) => require(path.join(root, file));
const items = [{ name: 'mug', grams: 150, qty: 2 }];
const order = { id: 7, address: 'Lyon', items };
const checks = [
  ['checkout', () => load('src/checkout').shippingCents(items) === 48],
  ['weight', () => load('src/weight').parcelWeight(items) === 350],
  ['labels', () => load('src/labels').labelFor(order).weight === '350 g'],
  ['quote', () => load('src/api/quote').quote(order).grams === 350],
  ['daily', () => load('src/reports/daily').dailySummary([order, order]).totalGrams === 700],
  ['customs', () => load('src/customs').customsDeclaration(order).grossGrams === 350],
  ['inventory untouched', () => load('src/inventory').stockGrams(items) === 300],
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
