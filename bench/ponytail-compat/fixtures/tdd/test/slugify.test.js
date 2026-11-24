const test = require('node:test');
const assert = require('node:assert/strict');
const { slugify } = require('../src/text');

test('slugify joins words with dashes', () => {
  assert.equal(slugify('Hello, World'), 'hello-world');
});
