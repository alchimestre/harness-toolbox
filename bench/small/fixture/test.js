const assert = require('node:assert/strict');
const { slugify } = require('./lib/text');
assert.equal(slugify('Hello, World!'), 'hello-world');
assert.equal(slugify('  Déjà vu  '), 'deja-vu');
assert.equal(slugify('a--b'), 'a-b');
console.log('ok');
