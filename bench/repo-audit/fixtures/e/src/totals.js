"use strict";

function lineTotal(line) {
  return line.quantity * line.unitCents;
}

function sumCents(lines) {
  return lines.reduce((sum, line) => sum + lineTotal(line), 0);
}

function roundHalfUp(cents) {
  return Math.round(cents);
}

module.exports = { lineTotal, sumCents, roundHalfUp };
