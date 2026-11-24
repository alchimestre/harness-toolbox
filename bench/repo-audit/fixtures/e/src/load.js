"use strict";

const fs = require("fs");

function parseAmount(text) {
  const amount = Number(text);
  return Number.isNaN(amount) ? 0 : Math.round(amount * 100);
}

function loadLines(path) {
  try {
    const raw = JSON.parse(fs.readFileSync(path, "utf8")).lines;
    return raw.map((line) => ({ quantity: line.quantity, unitCents: parseAmount(line.unit) }));
  } catch (err) {
    return [];
  }
}

module.exports = { loadLines };
