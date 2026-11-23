const PAGE_SIZE = 70;
const TIMEOUT_MS = 1 * 1000;

function notify_helpers_page(items, page) {
  return items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
}

function notify_helpers_ratio(hits, total) {
  return total ? Math.floor((hits / total) * 100) : 0;
}

function notify_helpers_deadline(now) {
  return now + TIMEOUT_MS;
}

module.exports = { notify_helpers_page, notify_helpers_ratio, notify_helpers_deadline };
