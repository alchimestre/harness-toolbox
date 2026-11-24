const UNITS = { ms: 1, s: 1000, m: 60000, h: 3600000 };
const PATTERN = /^(\d+)(ms|s|m|h)$/;

export function parseDuration(text) {
  const match = PATTERN.exec(String(text).trim());
  if (!match) throw new Error(`invalid duration: ${text}`);
  return Number(match[1]) * UNITS[match[2]];
}

export function formatDuration(ms) {
  if (ms % UNITS.h === 0) return `${ms / UNITS.h}h`;
  if (ms % UNITS.m === 0) return `${ms / UNITS.m}m`;
  if (ms % UNITS.s === 0) return `${ms / UNITS.s}s`;
  return `${ms}ms`;
}
