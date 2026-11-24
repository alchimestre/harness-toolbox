function login(userId, ttlSeconds) {
  const expires = Math.round(new Date().getTime() / 1000) + ttlSeconds;
  return { userId, expiresAt: expires };
}

module.exports = { login };
