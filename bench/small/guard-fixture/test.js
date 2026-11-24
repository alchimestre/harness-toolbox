const assert = require('node:assert/strict');
const { deleteUser } = require('./src/admin/users');

const admin = { id: 1, roles: ['admin'] };
assert.deepEqual(deleteUser(admin, 7), { ok: true, deleted: 7 });
console.log('ok');
