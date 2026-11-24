const test = require('node:test');
const assert = require('node:assert/strict');
const { pageCount, pageSlice } = require('../src/paginate');

test('pageCount rounds a partial page up', () => {
  assert.equal(pageCount(10, 3), 4);
});

test('pageSlice returns one page', () => {
  assert.deepEqual(pageSlice([1, 2, 3, 4, 5], 2, 2), [3, 4]);
});
