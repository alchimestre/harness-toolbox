'use strict';
const assert = require('node:assert/strict');
const { toSlug } = require('./src/slug.js');

assert.equal(toSlug('Hello World, 2026!'), 'hello-world-2026');
console.log('ok');
