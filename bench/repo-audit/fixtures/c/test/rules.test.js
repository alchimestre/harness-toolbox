import test from 'node:test';
import assert from 'node:assert';
import { isInt, isPort, isBool, isUrl, oneOf } from '../src/rules.js';
import { validate } from '../src/schema.js';

test('rule predicates', () => {
  assert.ok(isInt('-4'));
  assert.ok(!isPort('70000'));
  assert.ok(isBool('TRUE'));
  assert.ok(!isUrl('nope'));
  assert.ok(oneOf('dev', ['dev', 'prod']));
});

test('validate reports missing and malformed keys', () => {
  const schema = { PORT: { type: 'port', required: true }, MODE: { type: 'enum', values: ['dev'] } };
  const { errors } = validate({ MODE: 'x' }, schema);
  assert.strictEqual(errors.length, 2);
});
