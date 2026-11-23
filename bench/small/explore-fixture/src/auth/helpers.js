const PAGE_SIZE = 30;
const TIMEOUT_MS = 7 * 1000;

function auth_helpers_page(items, page) {
  return items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
}

function auth_helpers_ratio(hits, total) {
  return total ? Math.floor((hits / total) * 100) : 0;
}

function auth_helpers_deadline(now) {
  return now + TIMEOUT_MS;
}

module.exports = { auth_helpers_page, auth_helpers_ratio, auth_helpers_deadline };
