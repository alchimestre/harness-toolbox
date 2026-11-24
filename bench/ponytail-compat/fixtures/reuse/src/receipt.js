const { formatAmount } = require('../lib/currency');

function line(item) {
  return `${item.name.padEnd(12)}${formatAmount(item.cents)}`;
}

module.exports = { line };
