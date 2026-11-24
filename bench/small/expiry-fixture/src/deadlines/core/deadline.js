function ttlDeadline(ttlSeconds) {
  return Date.now() + ttlSeconds;
}

module.exports = { ttlDeadline };
