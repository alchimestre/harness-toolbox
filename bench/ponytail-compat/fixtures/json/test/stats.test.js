const test = require('node:test');
const assert = require('node:assert/strict');
const { mean } = require('../src/stats');

test('mean averages values', () => {
  assert.equal(mean([1, 2, 3]), 2);
});
