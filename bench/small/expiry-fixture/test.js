const assert = require('node:assert/strict');
const { createSession } = require('./src/session');

const session = createSession('user-1', 3600);
assert.ok(Math.abs(session.expiresAt - (Date.now() + 3600 * 1000)) < 5000);
console.log('ok');
