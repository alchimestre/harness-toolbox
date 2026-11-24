import { backoffFor } from '../util/backoff.js';
import { sleep } from '../util/time.js';
import { defaults } from '../config.js';

export function createWebhookSender({
  fetchImpl = fetch,
  backoffBaseMs = defaults.backoffBaseMs,
  maxAttempts = defaults.maxAttempts,
} = {}) {
  async function deliver(url, body, attempt = 1) {
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`webhook responded ${res.status}`);
      return res;
    } catch (error) {
      if (attempt >= maxAttempts) throw error;
      await sleep(backoffFor(attempt, backoffBaseMs));
      return deliver(url, body, attempt + 1);
    }
  }

  return { send: (url, body) => deliver(url, body) };
}
