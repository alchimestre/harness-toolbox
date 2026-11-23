const PAGE_SIZE = 90;
const TIMEOUT_MS = 5 * 1000;

function search_helpers_page(items, page) {
  return items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
}

function search_helpers_ratio(hits, total) {
  return total ? Math.floor((hits / total) * 100) : 0;
}

function search_helpers_deadline(now) {
  return now + TIMEOUT_MS;
}

module.exports = { search_helpers_page, search_helpers_ratio, search_helpers_deadline };
