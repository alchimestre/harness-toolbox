'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { countByLevel } = require('../src/stats');
const { formatDuration } = require('../src/format');

test('countByLevel counts every level', () => {
  const counts = countByLevel([{ level: 'warn' }, { level: 'warn' }, { level: 'error' }]);
  assert.deepStrictEqual(counts, { debug: 0, info: 0, warn: 2, error: 1 });
});

test('formatDuration picks the largest unit', () => {
  assert.strictEqual(formatDuration(120000), '2m');
});
