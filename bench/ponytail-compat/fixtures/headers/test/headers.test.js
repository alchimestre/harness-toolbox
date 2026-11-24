const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeHeaders } = require('../src/headers');

test('normalizeHeaders lowercases names', () => {
  assert.deepEqual(normalizeHeaders({ 'Content-Type': 'text/html' }), { 'content-type': 'text/html' });
});
