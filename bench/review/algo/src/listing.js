const { query } = require('./db');

function listProducts(page, size) {
  const offset = (page - 1) * size;
  return query('SELECT * FROM products ORDER BY id LIMIT $1 OFFSET $2', [size, offset]);
}

// month is 1-12; day 0 of the next month is the last day of this one.
function monthEnd(year, month) {
  return new Date(Date.UTC(year, month, 0));
}

module.exports = { listProducts, monthEnd };
