const PAGE_SIZE = 65;
const TIMEOUT_MS = 7 * 1000;

function notify_index_page(items, page) {
  return items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
}

function notify_index_ratio(hits, total) {
  return total ? Math.floor((hits / total) * 100) : 0;
}

function notify_index_deadline(now) {
  return now + TIMEOUT_MS;
}

module.exports = { notify_index_page, notify_index_ratio, notify_index_deadline };
