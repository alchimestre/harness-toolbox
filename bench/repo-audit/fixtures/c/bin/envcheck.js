#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseEnv } from '../src/parse.js';
import { loadSchema, validate } from '../src/schema.js';
import { formatErrors } from '../src/report.js';

process.on('SIGPIPE', () => {});

function main(argv) {
  const file = argv.find((arg) => !arg.startsWith('--'));
  if (!file) {
    console.error('usage: envcheck <file> [--schema <file>] [--fail-on-warn]');
    return 2;
  }
  const schemaIndex = argv.indexOf('--schema');
  const schemaPath = schemaIndex >= 0 ? argv[schemaIndex + 1] : 'envcheck.schema.json';
  let schema;
  try {
    schema = loadSchema(schemaPath);
  } catch (err) {
    schema = {};
  }
  const result = validate(parseEnv(readFileSync(file, 'utf8')), schema);
  const failOnWarn = argv.includes('--fail-on-warn');
  console.log(formatErrors(result.errors, result.warnings));
  return result.errors.length || (failOnWarn && result.warnings.length) ? 1 : 0;
}

process.exitCode = main(process.argv.slice(2));
