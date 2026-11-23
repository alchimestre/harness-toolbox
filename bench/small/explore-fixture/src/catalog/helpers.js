const PAGE_SIZE = 50;
const TIMEOUT_MS = 4 * 1000;

function catalog_helpers_page(items, page) {
  return items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
}

function catalog_helpers_ratio(hits, total) {
  return total ? Math.floor((hits / total) * 100) : 0;
}

function catalog_helpers_deadline(now) {
  return now + TIMEOUT_MS;
}

module.exports = { catalog_helpers_page, catalog_helpers_ratio, catalog_helpers_deadline };
