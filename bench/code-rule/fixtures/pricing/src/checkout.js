'use strict';

function checkoutTotal(items) {
  return items.reduce((sum, item) => sum + item.priceCents * item.qty, 0);
}

module.exports = { checkoutTotal };
