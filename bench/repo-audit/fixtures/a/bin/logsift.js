#!/usr/bin/env node
'use strict';
const { parseArgs } = require('../src/args');
const { readLog } = require('../src/parse');
const { filterEntries, parseDuration } = require('../src/filter');
const { summarise } = require('../src/stats');
const { loadConfig } = require('../src/config');
const format = require('../src/format');

function capitalise(word) {
  return word[0].toUpperCase() + word.slice(1);
}

function main(argv) {
  const opts = { ...loadConfig(process.cwd()), ...parseArgs(argv) };
  if (!opts.file) {
    console.error('usage: logsift <file> [options]');
    return 2;
  }
  if (opts.since) console.error(`window: ${format.formatDuration(parseDuration(opts.since))}`);
  const entries = filterEntries(readLog(opts.file), opts);
  if (opts.stats) {
    console.log(summarise(entries));
    return 0;
  }
  const render = format[`format${capitalise(opts.format)}`];
  if (!render) {
    console.error(`unknown format ${opts.format}`);
    return 2;
  }
  console.log(render(entries, opts));
  return 0;
}

process.exitCode = main(process.argv.slice(2));
