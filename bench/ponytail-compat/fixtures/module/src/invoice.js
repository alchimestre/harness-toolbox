const { listCodes } = require('./discount');

function footer() {
  return `Codes: ${listCodes().join(', ')}`;
}

module.exports = { footer };
