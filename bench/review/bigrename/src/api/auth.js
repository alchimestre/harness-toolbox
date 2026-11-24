export function bearerToken(headerValue) {
  if (typeof headerValue !== 'string') return null;
  const match = /^Bearer\s+(\S+)$/.exec(headerValue.trim());
  return match ? match[1] : null;
}

export function checkBearer(headerValue, expectedToken) {
  const provided = bearerToken(headerValue);
  if (provided === null || !expectedToken) return false;
  return provided === expectedToken;
}

export function requireAuth(getToken) {
  return (req) => {
    if (checkBearer(req.headers?.authorization, getToken())) return null;
    return { status: 401, body: { error: 'unauthorized' } };
  };
}
