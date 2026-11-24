'use strict';
const fs = require('fs');

function parseLines(text) {
  const entries = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch (err) {
      // next line
    }
  }
  return entries;
}

function readLog(file) {
  return parseLines(fs.readFileSync(file, 'utf8'));
}

module.exports = { parseLines, readLog };
