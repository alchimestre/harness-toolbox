const test = require('node:test');
const assert = require('node:assert/strict');
const { createUser, getUser } = require('../src/api');

test('created users can be read back', () => {
  const created = createUser({ body: { name: 'Ada' } });
  assert.equal(getUser({ params: { id: created.body.id } }).body.name, 'Ada');
});
