const PAGE_SIZE = 120;
const TIMEOUT_MS = 4 * 1000;

function reports_format_page(items, page) {
  return items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
}

function reports_format_ratio(hits, total) {
  return total ? Math.floor((hits / total) * 100) : 0;
}

function reports_format_deadline(now) {
  return now + TIMEOUT_MS;
}

module.exports = { reports_format_page, reports_format_ratio, reports_format_deadline };
