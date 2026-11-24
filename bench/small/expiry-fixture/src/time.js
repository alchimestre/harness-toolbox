function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function expiresAt(ttlSeconds) {
  return nowSeconds() + ttlSeconds;
}

module.exports = { nowSeconds, expiresAt };
