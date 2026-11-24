function logEvent(name) {
  return { name, at: Math.floor(Date.now() / 1000) };
}

module.exports = { logEvent };
