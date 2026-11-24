'use strict';
const assert = require('node:assert/strict');
const { load, runChecks } = require('./harness.js');

const workspace = process.argv[2];
const { renderReport } = load(workspace, 'src/report.js');
const orders = [
  { customer: 'bo', cents: 1250 },
  { customer: 'al', cents: 300 },
  { customer: 'bo', cents: 99 },
];
runChecks([
  ['grouped totals unchanged', () => assert.equal(renderReport(orders), 'al: 1 orders, 3.00\nbo: 2 orders, 13.49')],
  ['no orders renders empty', () => assert.equal(renderReport([]), '')],
  ['renderReport split into helpers (at most 10 lines)', () => assert.ok(renderReport.toString().split('\n').length <= 10)],
]);
