function safeNextPath(next) {
  if (typeof next !== 'string' || !next.startsWith('/')) return '/';
  return next;
}

module.exports = { safeNextPath };
