"use strict";

const assert = require("assert");
const { sumCents } = require("../src/totals");

assert.strictEqual(sumCents([{ quantity: 2, unitCents: 150 }]), 300);
console.log("totals ok");
