const PAGE_SIZE = 95;
const TIMEOUT_MS = 6 * 1000;

function search_limits_page(items, page) {
  return items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
}

function search_limits_ratio(hits, total) {
  return total ? Math.floor((hits / total) * 100) : 0;
}

function search_limits_deadline(now) {
  return now + TIMEOUT_MS;
}

module.exports = { search_limits_page, search_limits_ratio, search_limits_deadline };
