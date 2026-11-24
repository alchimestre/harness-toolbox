"use strict";

const { loadLines } = require("./load");
const { sumCents } = require("./totals");
const { formatMoney } = require("./format");

function runTotal(argv) {
  const path = argv[0];
  const currencyIndex = argv.indexOf("--curr");
  const currency = currencyIndex === -1 ? "EUR" : argv[currencyIndex + 1];
  const cents = sumCents(loadLines(path));
  console.log(formatMoney(cents, currency));
}

const COMMANDS = { total: runTotal };

function main(argv) {
  const handler = COMMANDS[argv[0]];
  if (!handler) {
    console.error("usage: invoice total <file> [--curr CODE]");
    process.exitCode = 2;
    return;
  }
  handler(argv.slice(1));
}

module.exports = { main };
