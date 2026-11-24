'use strict';
const COLOURS = { debug: 36, info: 32, warn: 33, error: 31 };

function colour(level, text) {
  if (process.env.LOGSIFT_COLOR === '0') return text;
  return `\x1b[${COLOURS[level]}m${text}\x1b[0m`;
}

function formatLines(entries, _opts) {
  return entries.map((entry) => `${entry.time} ${colour(entry.level, entry.level)} ${entry.msg}`).join('\n');
}

function formatTable(entries) {
  const rows = entries.map((entry) => [entry.time, entry.level, entry.msg]);
  return rows.map((row) => row.map((cell) => String(cell).padEnd(24)).join('')).join('\n');
}

function formatJson(entries) {
  return JSON.stringify(entries, null, 2);
}

function formatDuration(ms) {
  if (ms >= 3600000) return `${Math.round(ms / 3600000)}h`;
  if (ms >= 60000) return `${Math.round(ms / 60000)}m`;
  return `${Math.round(ms / 1000)}s`;
}

module.exports = { formatLines, formatTable, formatJson, formatDuration };
