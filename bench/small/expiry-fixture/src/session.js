const { expiresAt } = require('./time');

function createSession(userId, ttlSeconds) {
  return { userId, expiresAt: expiresAt(ttlSeconds) };
}

module.exports = { createSession };
