'use strict';
const assert = require('node:assert/strict');
const { load, runChecks } = require('./harness.js');

const workspace = process.argv[2];
const cases = [
  [[], 0],
  [[{ priceCents: 1000, qty: 2 }], 2400],
  [[{ priceCents: 999, qty: 1 }], 1199],
  [[{ priceCents: 10000, qty: 1 }], 12000],
  [[{ priceCents: 10001, qty: 1 }], 11401],
  [[{ priceCents: 12000, qty: 1 }], 13800],
  [[{ priceCents: 250, qty: 3 }, { priceCents: 1, qty: 1 }], 901],
];
runChecks(cases.map(([items, total]) => [
  `checkoutTotal(${JSON.stringify(items)})`,
  () => assert.equal(load(workspace, 'src/checkout.js').checkoutTotal(items), total),
]));
