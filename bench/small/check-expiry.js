// Hidden cases for the expiry fixture; never copied into the workspace.
const path = require('node:path');

const root = path.resolve(process.argv[2]);
const load = (file) => require(path.join(root, file));
const TOLERANCE_MS = 5000;
const isMsFromNow = (stamp, ttlSeconds) => Math.abs(stamp - (Date.now() + ttlSeconds * 1000)) < TOLERANCE_MS;
const checks = [
  ['session', () => isMsFromNow(load('src/session').createSession('u1', 3600).expiresAt, 3600)],
  ['refresh', () => isMsFromNow(load('src/tokens/refresh').refreshExpiry(2592000), 2592000)],
  ['cookie', () => isMsFromNow(load('src/auth/cookie').cookieFor(600).expiresAt, 600)],
  ['login', () => isMsFromNow(load('src/api/login').login('u1', 600).expiresAt, 600)],
  ['deadlines', () => isMsFromNow(load('src/deadlines').sessionDeadline(600), 600)],
  ['records', () => isMsFromNow(load('src/store/records').recordWithExpiry('k', 600).expiresAt, 600)],
  ['metrics untouched', () => Math.abs(load('src/metrics/log').logEvent('x').at - Date.now() / 1000) < 5],
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
