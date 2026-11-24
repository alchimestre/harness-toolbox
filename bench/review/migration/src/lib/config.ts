export interface AppConfig {
  databaseUrl: string;
  port: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  maxPoolSize: number;
  statementTimeoutMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    databaseUrl: requireEnv(env, 'DATABASE_URL'),
    port: readInteger(env, 'PORT', 3000),
    logLevel: readLogLevel(env.LOG_LEVEL),
    maxPoolSize: readInteger(env, 'PG_POOL_SIZE', 10),
    statementTimeoutMs: readInteger(env, 'PG_STATEMENT_TIMEOUT_MS', 5000),
  };
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value) {
    throw new Error(`missing ${key}`);
  }
  return value;
}

function readInteger(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`${key} must be an integer`);
  }
  return parsed;
}

function readLogLevel(raw: string | undefined): AppConfig['logLevel'] {
  if (raw === 'debug' || raw === 'warn' || raw === 'error') {
    return raw;
  }
  return 'info';
}
