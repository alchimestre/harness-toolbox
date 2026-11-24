import { randomBytes } from 'node:crypto';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

export function newId(prefix = 'task') {
  return `${prefix}-${randomString(10)}`;
}

export function randomString(length) {
  const bytes = randomBytes(length);
  let out = '';
  for (const byte of bytes) {
    out += ALPHABET[byte % ALPHABET.length];
  }
  return out;
}

export function isId(value) {
  return typeof value === 'string' && /^[a-z]+-[0-9a-z]{10}$/.test(value);
}
