'use strict';
const assert = require('node:assert/strict');
const { load, runChecks } = require('./harness.js');

const workspace = process.argv[2];
const settings = load(workspace, 'src/settings.js').loadSettings(workspace);
runChecks([
  ['cache ttl is 300', () => assert.equal(settings.cache.ttl, '300')],
  ['pool size is 20', () => assert.equal(settings.pool.size, '20')],
  ['log level untouched', () => assert.equal(settings.log.level, 'info')],
]);
