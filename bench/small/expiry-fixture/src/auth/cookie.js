const { nowSeconds } = require('../time');

function cookieFor(ttlSeconds) {
  return { name: 'sid', expiresAt: nowSeconds() + ttlSeconds };
}

module.exports = { cookieFor };
