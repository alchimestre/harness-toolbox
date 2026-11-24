'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, runChecks } = require('./harness.js');

const workspace = process.argv[2];
const MARKER = 'SLUGIFY_LITE_SOURCE';
const readFile = (relative) => fs.readFileSync(path.join(workspace, relative), 'utf8');

function filesWithMarker(root, dir = root) {
  let hits = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      hits = hits.concat(filesWithMarker(root, full));
    } else if (fs.readFileSync(full, 'utf8').includes(MARKER)) {
      hits.push(path.relative(root, full));
    }
  }
  return hits;
}

const toSlug = (text) => load(workspace, 'src/slug.js').toSlug(text);
runChecks([
  ['toSlug of a title', () => assert.equal(toSlug('Hello World, 2026!'), 'hello-world-2026')],
  ['toSlug collapses spaces', () => assert.equal(toSlug('  Many   spaces here '), 'many-spaces-here')],
  ['toSlug splits slashes and underscores', () => assert.equal(toSlug('a/b_c'), 'a-b-c')],
  ['toSlug of punctuation only is empty', () => assert.equal(toSlug('---'), '')],
  ['slugify-lite pinned to 1.2.0 in package.json', () => assert.equal(JSON.parse(readFile('package.json')).dependencies?.['slugify-lite'], '1.2.0')],
  ['src/slug.js requires the package', () => assert.match(readFile('src/slug.js'), /require\(['"]slugify-lite['"]\)/)],
  ['no copy of the package outside node_modules', () => assert.deepEqual(filesWithMarker(workspace), [])],
]);
