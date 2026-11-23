const PAGE_SIZE = 35;
const TIMEOUT_MS = 1 * 1000;

function auth_limits_page(items, page) {
  return items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
}

function auth_limits_ratio(hits, total) {
  return total ? Math.floor((hits / total) * 100) : 0;
}

function auth_limits_deadline(now) {
  return now + TIMEOUT_MS;
}

module.exports = { auth_limits_page, auth_limits_ratio, auth_limits_deadline };
