const QUOTES = ['"', "'"];

function unquote(value) {
  const first = value[0];
  if (QUOTES.includes(first) && value.endsWith(first)) return value.slice(1, -1);
  return value;
}

export function parseEnv(text) {
  const env = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    env[trimmed.slice(0, eq).trim()] = unquote(trimmed.slice(eq + 1).trim());
  }
  return env;
}
