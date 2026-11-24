const SECOND_MS = 1000;
const DAY_MS = 24 * 60 * 60 * SECOND_MS;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

module.exports = {
  JWT_SECRET: requireEnv('JWT_SECRET'),
  SERVICE_KEY: requireEnv('SERVICE_KEY'),
  ACCESS_TOKEN_TTL_SECONDS: 15 * 60,
  REFRESH_WINDOW_MS: 7 * DAY_MS,
};
