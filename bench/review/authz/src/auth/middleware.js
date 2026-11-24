const { verifyToken, TokenError } = require('./tokens');

const BEARER_PREFIX = 'Bearer ';

function readBearer(req) {
  const header = req.get('Authorization') ?? '';
  if (!header.startsWith(BEARER_PREFIX)) return null;
  return header.slice(BEARER_PREFIX.length);
}

function rejectInvalid(res) {
  return res.status(401).json({ error: 'invalid token' });
}

function authenticate(req, res, next) {
  const token = readBearer(req);
  if (!token) return res.status(401).json({ error: 'missing token' });
  try {
    const claims = verifyToken(token);
    req.user = { id: claims.sub, role: claims.role };
    return next();
  } catch (error) {
    if (error instanceof TokenError) return rejectInvalid(res);
    return next(error);
  }
}

module.exports = { authenticate };
