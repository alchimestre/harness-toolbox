"use strict";

function formatMoney(cents, currency) {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

module.exports = { formatMoney };
