const test = require('node:test');
const assert = require('node:assert/strict');
const { countBy } = require('../src/counter');

test('countBy counts each key', () => {
  assert.deepEqual(countBy([{ k: 'a' }, { k: 'b' }, { k: 'a' }], 'k'), { a: 2, b: 1 });
});
