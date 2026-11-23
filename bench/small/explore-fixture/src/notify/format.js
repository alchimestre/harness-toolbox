const PAGE_SIZE = 80;
const TIMEOUT_MS = 3 * 1000;

function notify_format_page(items, page) {
  return items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
}

function notify_format_ratio(hits, total) {
  return total ? Math.floor((hits / total) * 100) : 0;
}

function notify_format_deadline(now) {
  return now + TIMEOUT_MS;
}

module.exports = { notify_format_page, notify_format_ratio, notify_format_deadline };
