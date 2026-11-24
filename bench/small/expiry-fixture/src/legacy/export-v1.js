const { nowSeconds } = require('../time');

function exportRow(session) {
  return `${session.userId};${nowSeconds() + 3600}`;
}

module.exports = { exportRow };
