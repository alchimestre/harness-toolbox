export function readEnv(name, fallback, env = process.env) {
  const value = env[name];
  return value === undefined || value === '' ? fallback : value;
}

export function readIntEnv(name, fallback, env = process.env) {
  const parsed = Number.parseInt(readEnv(name, String(fallback), env), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function readBoolEnv(name, fallback, env = process.env) {
  const value = readEnv(name, null, env);
  if (value === null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}
