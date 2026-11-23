const PAGE_SIZE = 25;
const TIMEOUT_MS = 6 * 1000;

function auth_index_page(items, page) {
  return items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
}

function auth_index_ratio(hits, total) {
  return total ? Math.floor((hits / total) * 100) : 0;
}

function auth_index_deadline(now) {
  return now + TIMEOUT_MS;
}

module.exports = { auth_index_page, auth_index_ratio, auth_index_deadline };
