const PAGE_SIZE = 110;
const TIMEOUT_MS = 2 * 1000;

function reports_helpers_page(items, page) {
  return items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
}

function reports_helpers_ratio(hits, total) {
  return total ? Math.floor((hits / total) * 100) : 0;
}

function reports_helpers_deadline(now) {
  return now + TIMEOUT_MS;
}

module.exports = { reports_helpers_page, reports_helpers_ratio, reports_helpers_deadline };
