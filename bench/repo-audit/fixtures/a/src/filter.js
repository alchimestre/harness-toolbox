'use strict';

const LEVELS = ['debug', 'info', 'warn', 'error'];
const UNIT_MS = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000 };

function parseDuration(text) {
  const match = /^(\d+)([smh])$/.exec(text);
  if (!match) throw new Error(`bad duration ${text}`);
  return Number(match[1]) * UNIT_MS[match[2]];
}

function atLeast(entry, level) {
  return LEVELS.indexOf(entry.level) >= LEVELS.indexOf(level);
}

function filterEntries(entries, opts, now = Date.now()) {
  const cutoff = opts.since ? now - parseDuration(opts.since) : -Infinity;
  return entries.filter((entry) => atLeast(entry, opts.level) && Date.parse(entry.time) >= cutoff);
}

module.exports = { filterEntries, parseDuration, LEVELS };
