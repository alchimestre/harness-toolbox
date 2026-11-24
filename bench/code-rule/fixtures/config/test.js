'use strict';
const assert = require('node:assert/strict');
const { loadSettings } = require('./src/settings.js');

const settings = loadSettings(__dirname);
assert.equal(settings.cache.ttl, '300');
assert.equal(settings.pool.size, '20');
console.log('ok');
