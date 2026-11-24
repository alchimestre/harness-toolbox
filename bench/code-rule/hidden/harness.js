'use strict';
const path = require('node:path');

function load(workspace, relative) {
  return require(path.resolve(workspace, relative));
}

function runChecks(checks) {
  let passed = 0;
  for (const [name, check] of checks) {
    try {
      check();
      passed++;
    } catch (error) {
      console.error(`fail: ${name}: ${String(error.message).split('\n')[0]}`);
    }
  }
  console.log(`${passed}/${checks.length}`);
}

module.exports = { load, runChecks };
