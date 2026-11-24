'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseArgs } = require('../src/args');

test('parseArgs reads file, level and format alias', () => {
  const opts = parseArgs(['app.log', '--level', 'warn', '-f', 'table']);
  assert.deepStrictEqual([opts.file, opts.level, opts.format], ['app.log', 'warn', 'table']);
});

test('parseArgs rejects unknown options', () => {
  assert.throws(() => parseArgs(['--nope']), /unknown option/);
});
