const PAGE_SIZE = 105;
const TIMEOUT_MS = 1 * 1000;

function reports_index_page(items, page) {
  return items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
}

function reports_index_ratio(hits, total) {
  return total ? Math.floor((hits / total) * 100) : 0;
}

function reports_index_deadline(now) {
  return now + TIMEOUT_MS;
}

module.exports = { reports_index_page, reports_index_ratio, reports_index_deadline };
