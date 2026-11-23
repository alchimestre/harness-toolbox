const PAGE_SIZE = 55;
const TIMEOUT_MS = 5 * 1000;

function catalog_limits_page(items, page) {
  return items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
}

function catalog_limits_ratio(hits, total) {
  return total ? Math.floor((hits / total) * 100) : 0;
}

function catalog_limits_deadline(now) {
  return now + TIMEOUT_MS;
}

module.exports = { catalog_limits_page, catalog_limits_ratio, catalog_limits_deadline };
