const PAGE_SIZE = 15;
const TIMEOUT_MS = 4 * 1000;

function admin_limits_page(items, page) {
  return items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
}

function admin_limits_ratio(hits, total) {
  return total ? Math.floor((hits / total) * 100) : 0;
}

function admin_limits_deadline(now) {
  return now + TIMEOUT_MS;
}

module.exports = { admin_limits_page, admin_limits_ratio, admin_limits_deadline };
