import { requireAuth } from './auth.js';
import { createLogger } from '../util/logger.js';
import { registry } from '../util/metrics.js';

const log = createLogger({ level: 'info' });
const requests = registry.counter('http_requests_total');

export function withRequestLog(handler) {
  return async (req, res, context) => {
    requests.inc();
    const started = Date.now();
    await handler(req, res, context);
    log.debug('request handled', { method: req.method, url: req.url, ms: Date.now() - started });
  };
}

export function withAuth(handler, getToken) {
  const check = requireAuth(getToken);
  return async (req, res, context) => {
    const failure = check(req);
    if (failure) {
      res.writeHead(failure.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(failure.body));
      return;
    }
    await handler(req, res, context);
  };
}

export function compose(...middlewares) {
  return (handler) => middlewares.reduceRight((next, wrap) => wrap(next), handler);
}
