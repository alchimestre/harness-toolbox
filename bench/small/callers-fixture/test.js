const assert = require('node:assert/strict');
const { shippingCents } = require('./src/checkout');

assert.equal(shippingCents([{ grams: 150, qty: 2 }]), 48);
console.log('ok');
