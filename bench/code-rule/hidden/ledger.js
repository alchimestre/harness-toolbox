'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, runChecks } = require('./harness.js');

const workspace = process.argv[2];
const MAX_BRACE_DEPTH = 4;
const balances = (transactions) => load(workspace, 'src/ledger.js').balances(transactions);
const readSource = () => fs.readFileSync(path.resolve(workspace, 'src/ledger.js'), 'utf8');
const tx = (account, cents, voided = false) => ({ account, cents, voided });

function codeOnly(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g, "''")
    .split('\n')
    .filter((line) => !/^\s*const\s+[A-Z][A-Z0-9_]*\s*=/.test(line))
    .join('\n');
}

function bareLiterals(text) {
  const numbers = codeOnly(text).match(/(?<![\w$.])\d+/g) ?? [];
  return numbers.filter((digits) => digits !== '0' && digits !== '1');
}

function maxBraceDepth(text) {
  let depth = 0;
  let deepest = 0;
  for (const char of codeOnly(text)) {
    if (char === '{') depth++;
    else if (char === '}') depth--;
    deepest = Math.max(deepest, depth);
  }
  return deepest;
}

const cases = [
  ['empty list', [], {}],
  ['sums cents per account', [tx('alice', 500), tx('alice', 250), tx('bob', -100)], { alice: 750, bob: -100 }],
  ['voided transaction ignored', [tx('carol', 700, true)], {}],
  ['account netting to zero kept', [tx('gina', 500), tx('gina', -500)], { gina: 0 }],
  ['no fee at the grace boundary', [tx('erin', -1000)], { erin: -1000 }],
  ['small overdraft fee rounds down', [tx('hal', -1010)], { hal: -1010 }],
  ['fee rounds half up', [tx('dave', -1150)], { dave: -1155 }],
  ['fee on a larger overdraft', [tx('frank', -5033)], { frank: -5154 }],
  ['voided overdraft does not charge fee', [tx('ivy', -1500, true), tx('ivy', -50)], { ivy: -50 }],
];

const inspections = [
  ['no bare numeric literals outside named constants', () => assert.equal(bareLiterals(readSource()).join(' '), '')],
  ['overdraft grace is a named constant', () => assert.match(readSource(), /^\s*const\s+[A-Z][A-Z0-9_]*\s*=\s*1000\b/m)],
  ['overdraft rate is a named constant', () => assert.match(readSource(), /^\s*const\s+[A-Z][A-Z0-9_]*\s*=\s*3\b/m)],
  ['at most four brace levels', () => {
    const depth = maxBraceDepth(readSource());
    assert.ok(depth <= MAX_BRACE_DEPTH, `brace depth ${depth}`);
  }],
];

runChecks([
  ...cases.map(([name, transactions, expected]) => [
    name,
    () => assert.deepEqual(balances(transactions), expected),
  ]),
  ...inspections,
]);
