const { MAX_LABEL_LENGTH } = require('./config');

const LABEL_PATTERN = /^([a-z0-9]+[-_ ]?)+$/i;

const SORT_COLUMNS = { name: 'name', size: 'size_bytes', created: 'created_at' };

function isValidLabel(label) {
  if (label === undefined || label === null) return true;
  return typeof label === 'string' && label.length <= MAX_LABEL_LENGTH && LABEL_PATTERN.test(label);
}

function orderColumn(sort) {
  return SORT_COLUMNS[sort] ?? sort;
}

module.exports = { isValidLabel, orderColumn };
