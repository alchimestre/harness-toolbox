const DEFAULT_ORIGINS = ['http://localhost:3000'];

export function corsHeaders(origin, allowed = DEFAULT_ORIGINS) {
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, DELETE',
    'access-control-allow-headers': 'authorization, content-type',
    vary: 'origin',
  };
}

export function isPreflight(req) {
  return req.method === 'OPTIONS';
}
