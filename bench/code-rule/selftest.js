// Sanity check for static.js: each snippet must raise exactly the listed categories. usage: node selftest.js
const assert = require('node:assert/strict');
const { analyzeJs, analyzeConfig, analyzeFile } = require('./static.js');

const everyLine = (src) => new Set(src.split('\n').map((_, k) => k + 1));
const categories = (src) => [...new Set(analyzeJs(src, everyLine(src)).violations.map((v) => v.category))].sort();
const configCategories = (src, ext) => [...new Set(analyzeConfig(src, ext, everyLine(src)).violations.map((v) => v.category))];

const deep = `function f(a) {
  for (const x of a) {
    if (x) {
      for (const y of x) {
        if (y) {
          return y;
        }
      }
    }
  }
}`;
const long = `function f() {\n${'  run();\n'.repeat(45)}}`;

const cases = [
  ['clean', 'const RATE = 0.2;\nfunction price(cents) {\n  return cents * RATE;\n}\n', []],
  ['magic number', 'function price(cents) {\n  return cents * 1.2;\n}\n', ['literals']],
  ['named pure literal', 'const timeoutMs = 5000;\nconst rates = { eu: 0.2, us: -0.07 };\nconst HOUR_MS = 60 * 60 * 1000;\n', []],
  ['unary minus one', 'function f(a) {\n  return a.indexOf(1) === -1 ? 0 : -1;\n}\n', []],
  ['restating comment', '// Apply the discount\nconst discounted = price * DISCOUNT;\n', ['comments']],
  ['footgun comment', '// Round first, otherwise float error leaks into the total\nconst cents = Math.round(price);\n', []],
  ['paragraph comment', '// first line\n// second line because of reasons\nconst a = 1;\n', ['comments']],
  ['commented-out code', '// const old = require("old");\nconst a = 1;\n', ['comments']],
  ['banner', '// ---- helpers ----\nconst a = 1;\n', ['comments']],
  ['exported jsdoc', '/** Sums the cart. */\nfunction total() {\n  return 0;\n}\nmodule.exports = { total };\n', []],
  ['private jsdoc', '/** Sums the cart. */\nfunction total() {\n  return 0;\n}\n', ['comments']],
  ['deep nesting', deep, ['nesting']],
  ['long function', long, ['function-length']],
];

for (const [name, src, expected] of cases) assert.deepEqual(categories(src), expected, name);
assert.deepEqual(configCategories('# port = 5432\nport = 5432\n', '.ini'), ['comments']);
assert.deepEqual(configCategories('# database port\nport = 5432\n', '.ini'), ['comments']);
assert.deepEqual(configCategories('port = 5432\nttl = 5 # keep in sync with the proxy timeout\n', '.ini'), []);
const homeLine = new Set([1]);
assert.equal(analyzeFile('a.js', "const dir = '/home/shop';", homeLine).violations[0].category, 'paths');
assert.equal(analyzeFile('a.js', "const dir = '~/shop';", homeLine).violations[0].category, 'paths');
assert.equal(analyzeFile('a.js', "const dir = './shop';", homeLine).violations.length, 0);
console.log('ok');
