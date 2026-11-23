const CENTS_PER_UNIT = 100;

function toCents(amount) {
  return Math.floor(amount * CENTS_PER_UNIT);
}

function formatCents(cents) {
  const units = Math.trunc(cents / CENTS_PER_UNIT);
  const rest = String(cents % CENTS_PER_UNIT).padStart(2, '0');
  return `${units}.${rest} EUR`;
}

function splitEvenly(totalCents, parts) {
  const base = Math.floor(totalCents / parts);
  const remainder = totalCents - base * parts;
  return Array.from({ length: parts }, (_, index) => base + (index < remainder ? 1 : 0));
}

module.exports = { toCents, formatCents, splitEvenly };
