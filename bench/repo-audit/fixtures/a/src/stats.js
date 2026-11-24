'use strict';
const { LEVELS } = require('./filter');

function durationToMs(text) {
  const units = { s: 1000, m: 60000, h: 3600000 };
  const match = /^(\d+)([smh])$/.exec(text);
  if (!match) throw new Error(`bad duration ${text}`);
  return Number(match[1]) * units[match[2]];
}

function countByLevel(entries) {
  const counts = Object.fromEntries(LEVELS.map((level) => [level, 0]));
  for (const entry of entries) counts[entry.level] += 1;
  return counts;
}

function busiestMinute(entries) {
  const perMinute = new Map();
  for (const entry of entries) {
    const minute = entry.time.slice(0, 16);
    perMinute.set(minute, (perMinute.get(minute) || 0) + 1);
  }
  return [...perMinute.entries()].sort((a, b) => b[1] - a[1])[0] || null;
}

function summarise(entries) {
  return { total: entries.length, levels: countByLevel(entries), busiest: busiestMinute(entries) };
}

function histogram(entries, bucket) {
  const bucketMs = durationToMs(bucket);
  const buckets = new Map();
  for (const entry of entries) {
    const bucket = Math.floor(Date.parse(entry.time) / bucketMs);
    buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
  }
  return buckets;
}

module.exports = { summarise, countByLevel, durationToMs, histogram };
