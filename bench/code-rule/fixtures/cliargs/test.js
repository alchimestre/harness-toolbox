'use strict';
const assert = require('node:assert/strict');
const { parseArgs } = require('./src/cliargs.js');

assert.deepEqual(parseArgs(['--out', 'a.txt']), { out: 'a.txt' });
assert.deepEqual(parseArgs(['--out=a.txt']), { out: 'a.txt' });
assert.deepEqual(parseArgs(['--verbose', '--out', 'x']), { verbose: 'true', out: 'x' });
assert.deepEqual(parseArgs(['run', '--n', '3', 'extra']), { n: '3' });
assert.throws(() => parseArgs(['--big=' + 'x'.repeat(257)]), { message: 'value too long: big' });
console.log('ok');
