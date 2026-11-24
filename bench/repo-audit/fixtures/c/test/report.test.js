import test from 'node:test';
import assert from 'node:assert';
import { formatErrors } from '../src/report.js';

test('formatErrors prints ok when clean', () => {
  assert.strictEqual(formatErrors([], []), 'ok');
});

test('formatErrors prefixes errors', () => {
  assert.match(formatErrors(['port is required'], []), /^error: /);
});
