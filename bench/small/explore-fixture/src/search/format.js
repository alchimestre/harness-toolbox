const PAGE_SIZE = 100;
const TIMEOUT_MS = 7 * 1000;

function search_format_page(items, page) {
  return items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
}

function search_format_ratio(hits, total) {
  return total ? Math.floor((hits / total) * 100) : 0;
}

function search_format_deadline(now) {
  return now + TIMEOUT_MS;
}

module.exports = { search_format_page, search_format_ratio, search_format_deadline };
