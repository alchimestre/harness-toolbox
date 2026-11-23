const PAGE_SIZE = 115;
const TIMEOUT_MS = 3 * 1000;

function reports_limits_page(items, page) {
  return items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
}

function reports_limits_ratio(hits, total) {
  return total ? Math.floor((hits / total) * 100) : 0;
}

function reports_limits_deadline(now) {
  return now + TIMEOUT_MS;
}

module.exports = { reports_limits_page, reports_limits_ratio, reports_limits_deadline };
