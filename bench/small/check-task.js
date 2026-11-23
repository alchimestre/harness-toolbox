// Hidden cases for the task fixture; never copied into the workspace.
const assert = require('node:assert/strict');
const path = require('node:path');
const { orderTotal } = require(path.resolve(process.argv[2], 'src/orders'));

const cases = [
  [{ lines: [{ price: '19.99', qty: 1 }], taxRate: 0 }, '19.99'],
  [{ lines: [{ price: '0.29', qty: 3 }], taxRate: 0 }, '0.87'],
  [{ lines: [{ price: '10.00', qty: 1 }], taxRate: 0.2, code: 'SAVE5' }, '6.00'],
  [{ lines: [{ price: '2.50', qty: 4 }], taxRate: 0.1, code: 'SAVE10' }, '9.90'],
  [{ lines: [{ price: '3.00', qty: 1 }], taxRate: 0, code: 'SAVE5' }, '0.00'],
  [{ lines: [{ price: '10.05', qty: 1 }], taxRate: 0.05 }, '10.55'],
  [{ lines: [{ price: '4.35', qty: 2 }, { price: '1.10', qty: 3 }], taxRate: 0.08, code: 'SAVE10' }, '11.66'],
];
for (const [order, expected] of cases) assert.equal(orderTotal(order), expected, JSON.stringify(order));
