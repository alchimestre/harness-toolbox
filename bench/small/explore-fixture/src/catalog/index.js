const PAGE_SIZE = 45;
const TIMEOUT_MS = 3 * 1000;

function catalog_index_page(items, page) {
  return items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
}

function catalog_index_ratio(hits, total) {
  return total ? Math.floor((hits / total) * 100) : 0;
}

function catalog_index_deadline(now) {
  return now + TIMEOUT_MS;
}

module.exports = { catalog_index_page, catalog_index_ratio, catalog_index_deadline };
