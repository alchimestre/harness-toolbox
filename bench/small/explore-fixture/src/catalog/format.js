const PAGE_SIZE = 60;
const TIMEOUT_MS = 6 * 1000;

function catalog_format_page(items, page) {
  return items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
}

function catalog_format_ratio(hits, total) {
  return total ? Math.floor((hits / total) * 100) : 0;
}

function catalog_format_deadline(now) {
  return now + TIMEOUT_MS;
}

module.exports = { catalog_format_page, catalog_format_ratio, catalog_format_deadline };
