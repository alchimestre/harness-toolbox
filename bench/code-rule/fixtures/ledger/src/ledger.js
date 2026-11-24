'use strict';

function balances(transactions) {
  const totals = {};
  for (const tx of transactions) {
    totals[tx.account] = (totals[tx.account] || 0) + tx.cents;
  }
  return totals;
}

module.exports = { balances };
