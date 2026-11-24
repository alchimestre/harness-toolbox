import { backoffFor } from '../util/backoff.js';
import { sleep } from '../util/time.js';

const REPORT_BASE_MS = 1000;

export async function reportHandler(payload) {
  const rows = await fetchWithRetry(() => dailyTotals(payload.from, payload.to));
  return rows.reduce((sum, row) => sum + row.total, 0);
}

export async function fetchWithRetry(load, attempts = 3) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await load();
    } catch (error) {
      if (attempt >= attempts) throw error;
      await sleep(backoffFor(REPORT_BASE_MS, attempt));
    }
  }
}

function dailyTotals(from, to) {
  const rows = [];
  for (let day = from; day <= to; day += 1) {
    rows.push({ day, total: day * 2 });
  }
  return rows;
}
