const assert = require('node:assert/strict');
const { cartTotal } = require('./src/cart');
assert.equal(cartTotal([{ price: '0.29', qty: 1 }]), '0.29');
console.log('ok');
