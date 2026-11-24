'use strict';
const assert = require('node:assert/strict');
const { renderReport } = require('./src/report.js');

const orders = [
  { customer: 'bo', cents: 1250 },
  { customer: 'al', cents: 300 },
  { customer: 'bo', cents: 99 },
];
assert.equal(renderReport(orders), 'al: 1 orders, 3.00\nbo: 2 orders, 13.49');
console.log('ok');
