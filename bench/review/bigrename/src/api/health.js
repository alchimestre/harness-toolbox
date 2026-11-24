import { registry } from '../util/metrics.js';

export function healthPayload(scheduler, startedAt = Date.now()) {
  const stats = scheduler.stats();
  return {
    status: 'ok',
    uptimeMs: Date.now() - startedAt,
    waiting: stats.waiting,
    done: stats.done,
    failed: stats.failed,
    counters: registry.snapshot().counters,
  };
}

export function healthStatusCode(payload) {
  return payload.status === 'ok' ? 200 : 503;
}
