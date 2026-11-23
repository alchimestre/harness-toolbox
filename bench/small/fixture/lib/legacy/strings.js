// Unused: kept for the old importer.
function squeeze(value) {
  return value.split('-').filter(Boolean).join('-');
}

module.exports = { squeeze };
