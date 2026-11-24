'use strict';
const assert = require('node:assert/strict');
const { balances } = require('./src/ledger.js');

assert.deepEqual(balances([]), {});
assert.deepEqual(balances([{ account: 'alice', cents: 500 }, { account: 'alice', cents: 250 }]), { alice: 750 });
assert.deepEqual(balances([{ account: 'bob', cents: 900, voided: true }]), {});
assert.deepEqual(balances([{ account: 'carol', cents: -1150 }]), { carol: -1155 });
console.log('ok');
