'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseLines } = require('../src/parse');

test('parseLines reads one entry per line', () => {
  const entries = parseLines('{"level":"info","msg":"a"}\n\n{"level":"warn","msg":"b"}\n');
  assert.deepStrictEqual(entries.map((e) => e.msg), ['a', 'b']);
});
