const PAGE_SIZE = 5;
const TIMEOUT_MS = 2 * 1000;

function admin_index_page(items, page) {
  return items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
}

function admin_index_ratio(hits, total) {
  return total ? Math.floor((hits / total) * 100) : 0;
}

function admin_index_deadline(now) {
  return now + TIMEOUT_MS;
}

module.exports = { admin_index_page, admin_index_ratio, admin_index_deadline };
