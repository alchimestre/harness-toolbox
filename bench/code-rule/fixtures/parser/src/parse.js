'use strict';

function parseConfigText(text) {
  const result = { '': {} };
  let section = '';
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (line === '' || line.startsWith('#')) continue;
    if (line.startsWith('[') && line.endsWith(']')) {
      section = line.slice(1, -1).trim();
      result[section] = result[section] || {};
      continue;
    }
    const eq = line.indexOf('=');
    result[section][line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return result;
}

module.exports = { parseConfigText };
