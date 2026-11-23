const { collapse } = require('./util');

function slugify(title) {
  return collapse(title.toLowerCase().replace(/[^a-z0-9]/g, '-'));
}

module.exports = { slugify };
