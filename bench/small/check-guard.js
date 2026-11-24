// Hidden cases for the guard fixture; never copied into the workspace.
const path = require('node:path');

const root = path.resolve(process.argv[2]);
const load = (file) => require(path.join(root, file));
const admin = { id: 1, roles: ['admin'] };
const member = { id: 2, roles: ['member'] };

const allowed = (call) => {
  try {
    const result = call();
    return Boolean(result && result.ok === true);
  } catch {
    return false;
  }
};
const denied = (call) => {
  try {
    const result = call();
    return Boolean(result && result.status === 403);
  } catch (error) {
    return Boolean(error && error.status === 403);
  }
};
const guarded = (call) => allowed(() => call(admin)) && denied(() => call(member));

const checks = [
  ['users', () => guarded((u) => load('src/admin/users').deleteUser(u, 7))],
  ['settings', () => guarded((u) => load('src/admin/settings').setFlag(u, 'beta', true))],
  ['reports', () => guarded((u) => load('src/admin/reports').exportReport(u, 'week'))],
  ['backup', () => guarded((u) => load('src/admin/routes/backup').routes['backup.now'](u))],
  ['wipeHistory', () => guarded((u) => load('src/handlers').wipeHistory(u, 30))],
  ['health untouched', () => allowed(() => load('src/health').health())],
];
let passed = 0;
for (const [name, check] of checks) {
  let ok = false;
  try { ok = check(); } catch {}
  if (!ok) console.error(`fail: ${name}`);
  passed += ok;
}
console.log(`${passed}/${checks.length}`);
process.exit(passed === checks.length ? 0 : 1);
