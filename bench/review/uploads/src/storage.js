const fs = require('fs/promises');
const path = require('path');
const { UPLOAD_ROOT } = require('./config');

function resolveUpload(ownerId, name) {
  const root = path.resolve(UPLOAD_ROOT);
  const requested = `${root}${path.sep}${ownerId}${path.sep}${name}`;
  if (!requested.startsWith(root + path.sep)) throw new Error('path escapes upload root');
  return path.normalize(requested);
}

async function writeUpload(ownerId, name, bytes) {
  const target = resolveUpload(ownerId, name);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, bytes);
  return target;
}

function readUpload(storedPath) {
  return fs.readFile(storedPath);
}

module.exports = { resolveUpload, writeUpload, readUpload };
