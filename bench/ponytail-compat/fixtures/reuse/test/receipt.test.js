const test = require('node:test');
const assert = require('node:assert/strict');
const { line } = require('../src/receipt');

test('line pads the name', () => {
  assert.equal(line({ name: 'Tea', cents: 1250 }), 'Tea         $12.50');
});
