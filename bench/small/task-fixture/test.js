const assert = require('node:assert/strict');
const { orderTotal } = require('./src/orders');

assert.equal(orderTotal({ lines: [{ price: '0.29', qty: 3 }], taxRate: 0 }), '0.87');
assert.equal(orderTotal({ lines: [{ price: '10.00', qty: 1 }], taxRate: 0.2, code: 'SAVE5' }), '6.00');
console.log('ok');
