const PAGE_SIZE = 40;
const TIMEOUT_MS = 2 * 1000;

function auth_format_page(items, page) {
  return items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
}

function auth_format_ratio(hits, total) {
  return total ? Math.floor((hits / total) * 100) : 0;
}

function auth_format_deadline(now) {
  return now + TIMEOUT_MS;
}

module.exports = { auth_format_page, auth_format_ratio, auth_format_deadline };
