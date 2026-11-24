'use strict';
const assert = require('node:assert/strict');
const { load, runChecks } = require('./harness.js');

const workspace = process.argv[2];
const parse = (text) => load(workspace, 'src/parse.js').parseConfigText(text);
const valueCases = [
  ['plain', 'a = 1', '', 'a', '1'],
  ['section', '[db]\nhost = x', 'db', 'host', 'x'],
  ['quoted value', '[db]\nhost = "local host"', 'db', 'host', 'local host'],
  ['unclosed quote kept', 'k = "open', '', 'k', '"open'],
  ['continuation', 'k = one \\\n   two \\\n three', '', 'k', 'one two three'],
  ['comments and blanks', '# c\n\nk = 1\n# d', '', 'k', '1'],
];
const errorCases = [
  ['error on line 2', 'ok = 1\nbad', 'line 2: expected key = value'],
  ['error line after continuation', 'a = 1 \\\n b\nbroken', 'line 3: expected key = value'],
];
runChecks([
  ...valueCases.map(([name, text, section, key, expected]) => [
    name,
    () => assert.equal(parse(text)[section][key], expected),
  ]),
  ...errorCases.map(([name, text, message]) => [
    name,
    () => assert.throws(() => parse(text), { message }),
  ]),
]);
