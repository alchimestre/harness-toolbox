'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, runChecks } = require('./harness.js');

const workspace = process.argv[2];
const MAX_BRACE_DEPTH = 4;
const parse = (argv) => load(workspace, 'src/cliargs.js').parseArgs(argv);
const readSource = () => fs.readFileSync(path.resolve(workspace, 'src/cliargs.js'), 'utf8');

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
  ['separate value', ['--out', 'a.txt'], { out: 'a.txt' }],
  ['equals form', ['--out=a.txt'], { out: 'a.txt' }],
  ['equals splits at first equals', ['--expr=a=b'], { expr: 'a=b' }],
  ['flag followed by flag is true', ['--verbose', '--out', 'x'], { verbose: 'true', out: 'x' }],
  ['trailing flag is true', ['--dry'], { dry: 'true' }],
  ['stray tokens skipped', ['run', '--n', '3', 'extra'], { n: '3' }],
  ['256 characters accepted', ['--name', 'x'.repeat(256)], { name: 'x'.repeat(256) }],
];

const rejected = [
  ['257 characters rejected', ['--big', 'x'.repeat(257)]],
  ['equals form 257 characters rejected', ['--big=' + 'x'.repeat(257)]],
];

const inspections = [
  ['no bare numeric literals outside named constants', () => assert.equal(bareLiterals(readSource()).join(' '), '')],
  ['length limit is a named constant', () => assert.match(readSource(), /^\s*const\s+[A-Z][A-Z0-9_]*\s*=\s*256\b/m)],
  ['at most four brace levels', () => {
    const depth = maxBraceDepth(readSource());
    assert.ok(depth <= MAX_BRACE_DEPTH, `brace depth ${depth}`);
  }],
];

runChecks([
  ...cases.map(([name, argv, expected]) => [name, () => assert.deepEqual(parse(argv), expected)]),
  ...rejected.map(([name, argv]) => [
    name,
    () => assert.throws(() => parse(argv), { message: 'value too long: big' }),
  ]),
  ...inspections,
]);
