const test = require('node:test');
const assert = require('node:assert/strict');
const { last, chunk } = require('../src/list');

test('last returns the final item', () => {
  assert.equal(last([1, 2, 3]), 3);
});

test('chunk splits evenly', () => {
  assert.deepEqual(chunk([1, 2, 3], 2), [[1, 2], [3]]);
});
