const assert = require('node:assert/strict');
const { checkout } = require('./src/cart');
const { footer } = require('./src/invoice');

assert.equal(checkout([{ cents: 999 }], 'HALF'), 500);
assert.equal(checkout([{ cents: 500 }], 'NOPE'), 500);
assert.equal(footer(), 'Codes: HALF, SAVE10');
console.log('ok');
