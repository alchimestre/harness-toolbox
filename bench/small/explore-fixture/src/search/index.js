const PAGE_SIZE = 85;
const TIMEOUT_MS = 4 * 1000;

function search_index_page(items, page) {
  return items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
}

function search_index_ratio(hits, total) {
  return total ? Math.floor((hits / total) * 100) : 0;
}

function search_index_deadline(now) {
  return now + TIMEOUT_MS;
}

module.exports = { search_index_page, search_index_ratio, search_index_deadline };
