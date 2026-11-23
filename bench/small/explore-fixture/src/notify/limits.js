const PAGE_SIZE = 75;
const TIMEOUT_MS = 2 * 1000;

function notify_limits_page(items, page) {
  return items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
}

function notify_limits_ratio(hits, total) {
  return total ? Math.floor((hits / total) * 100) : 0;
}

function notify_limits_deadline(now) {
  return now + TIMEOUT_MS;
}

module.exports = { notify_limits_page, notify_limits_ratio, notify_limits_deadline };
