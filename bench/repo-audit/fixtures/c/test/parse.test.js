import test from 'node:test';
import assert from 'node:assert';
import { parseEnv } from '../src/parse.js';

test('parseEnv skips comments and unquotes values', () => {
  const env = parseEnv('# note\nA=1\nB="two words"\n');
  assert.deepStrictEqual(env, { A: '1', B: 'two words' });
});
