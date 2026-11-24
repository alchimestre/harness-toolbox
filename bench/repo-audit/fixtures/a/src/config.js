'use strict';
const fs = require('fs');
const path = require('path');

function loadConfig(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, '.logsiftrc'), 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    return {};
  }
}

module.exports = { loadConfig };
