const jwt = require('jsonwebtoken');
const { JWT_SECRET, ACCESS_TOKEN_TTL_SECONDS, REFRESH_WINDOW_MS } = require('../config');

const ALGORITHM = 'HS256';
const VERIFY_OPTIONS = { algorithms: [ALGORITHM] };
const REFRESH_VERIFY_OPTIONS = { ...VERIFY_OPTIONS, ignoreExpiration: true };
const SIGN_OPTIONS = { algorithm: ALGORITHM, expiresIn: ACCESS_TOKEN_TTL_SECONDS };

class TokenError extends Error {}

function signFor(subjectId, role) {
  return jwt.sign({ sub: subjectId, role }, JWT_SECRET, SIGN_OPTIONS);
}

function verifyWith(token, options) {
  try {
    return jwt.verify(token, JWT_SECRET, options);
  } catch (error) {
    throw new TokenError(error.message);
  }
}

function issueToken(user) {
  return signFor(user.id, user.role);
}

function verifyToken(token) {
  return verifyWith(token, VERIFY_OPTIONS);
}

function refreshToken(token) {
  const claims = verifyWith(token, REFRESH_VERIFY_OPTIONS);
  const secondsSinceExpiry = Math.floor(Date.now() / 1000) - claims.exp;
  if (secondsSinceExpiry > REFRESH_WINDOW_MS) throw new TokenError('refresh window passed');
  return signFor(claims.sub, claims.role);
}

module.exports = { issueToken, verifyToken, refreshToken, TokenError };
