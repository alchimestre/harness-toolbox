function recordWithExpiry(key, ttlSeconds) {
  const nowSec = Date.now() / 1000;
  return { key, expiresAt: Math.floor(nowSec) + ttlSeconds };
}

module.exports = { recordWithExpiry };
