'use strict';
const assert = require('node:assert/strict');
const { checkoutTotal } = require('./src/checkout.js');

assert.equal(checkoutTotal([{ priceCents: 1000, qty: 2 }]), 2400);
assert.equal(checkoutTotal([{ priceCents: 12000, qty: 1 }]), 13800);
console.log('ok');
