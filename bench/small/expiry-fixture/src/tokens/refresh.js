function refreshExpiry(ttlSeconds) {
  return Math.floor(Date.now() / 1000) + ttlSeconds;
}

module.exports = { refreshExpiry };
