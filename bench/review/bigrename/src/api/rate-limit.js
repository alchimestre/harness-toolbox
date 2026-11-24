export function createRateLimiter({ windowMs = 60000, max = 120, clock = Date.now } = {}) {
  const hits = new Map();

  function prune(key, cutoff) {
    const recent = (hits.get(key) ?? []).filter((time) => time > cutoff);
    if (recent.length === 0) hits.delete(key);
    else hits.set(key, recent);
    return recent;
  }

  return {
    allow(key) {
      const current = clock();
      const recent = prune(key, current - windowMs);
      if (recent.length >= max) return { allowed: false, retryAfterMs: recent[0] + windowMs - current };
      recent.push(current);
      hits.set(key, recent);
      return { allowed: true, retryAfterMs: 0 };
    },
    reset(key) {
      hits.delete(key);
    },
    size() {
      return hits.size;
    },
  };
}
