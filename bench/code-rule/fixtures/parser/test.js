'use strict';
const assert = require('node:assert/strict');
const { parseConfigText } = require('./src/parse.js');

assert.equal(parseConfigText('[db]\nhost = "local host"').db.host, 'local host');
assert.equal(parseConfigText('k = one \\\n   two \\\n three')[''].k, 'one two three');
assert.throws(() => parseConfigText('ok = 1\nbad'), { message: 'line 2: expected key = value' });
console.log('ok');
