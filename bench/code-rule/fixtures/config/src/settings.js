'use strict';
const fs = require('node:fs');
const path = require('node:path');

function loadSettings(root) {
  const text = fs.readFileSync(path.join(root, 'config', 'service.ini'), 'utf8');
  const settings = {};
  let section = '';
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#') || line.startsWith(';')) continue;
    if (line.startsWith('[')) {
      section = line.slice(1, -1);
      settings[section] = {};
      continue;
    }
    const eq = line.indexOf('=');
    settings[section][line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return settings;
}

module.exports = { loadSettings };
