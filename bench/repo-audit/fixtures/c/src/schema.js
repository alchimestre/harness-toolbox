import { readFileSync } from 'node:fs';
import { isBool, isInt, isPort, isUrl, oneOf } from './rules.js';

const CHECKS = { int: isInt, port: isPort, bool: isBool, url: isUrl };

export function loadSchema(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function validate(env, schema) {
  const errors = [];
  const warnings = [];
  for (const [key, rule] of Object.entries(schema)) {
    const value = env[key];
    if (value === undefined) {
      if (rule.required) errors.push(`${key} is required`);
      else if (rule.default !== undefined) warnings.push(`${key} missing, using ${stripQuotes(String(rule.default))}`);
      continue;
    }
    const ok = rule.type === 'enum' ? oneOf(value, rule.values) : (CHECKS[rule.type] || (() => true))(value);
    if (!ok) errors.push(`${key} must be ${rule.type}`);
  }
  return { errors, warnings };
}

function stripQuotes(text) {
  return text.replace(/^(["'])(.*)\1$/, '$2');
}
