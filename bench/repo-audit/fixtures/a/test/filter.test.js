'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { filterEntries, parseDuration } = require('../src/filter');

const NOW = Date.parse('2024-05-01T12:00:00Z');
const entries = [
  { time: '2024-05-01T11:59:00Z', level: 'error', msg: 'recent' },
  { time: '2024-05-01T10:00:00Z', level: 'warn', msg: 'old' },
  { time: '2024-05-01T11:59:30Z', level: 'debug', msg: 'noise' },
];

test('parseDuration converts units', () => {
  assert.strictEqual(parseDuration('10m'), 600000);
});

test('filterEntries applies level and window', () => {
  const kept = filterEntries(entries, { level: 'warn', since: '10m' }, NOW);
  assert.deepStrictEqual(kept.map((e) => e.msg), ['recent']);
});
