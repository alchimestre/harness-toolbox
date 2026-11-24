import { toConstantCase } from './names.js';

export function formatErrors(errors, warnings) {
  const lines = [
    ...errors.map((message) => `error: ${toConstantCase(message)}`),
    ...warnings.map((message) => `warn: ${message}`),
  ];
  return lines.length ? lines.join('\n') : 'ok';
}
