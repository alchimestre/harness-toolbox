const PAGE_SIZE = 10;
const TIMEOUT_MS = 3 * 1000;

function admin_helpers_page(items, page) {
  return items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
}

function admin_helpers_ratio(hits, total) {
  return total ? Math.floor((hits / total) * 100) : 0;
}

function admin_helpers_deadline(now) {
  return now + TIMEOUT_MS;
}

module.exports = { admin_helpers_page, admin_helpers_ratio, admin_helpers_deadline };
