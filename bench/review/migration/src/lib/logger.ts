type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

export function createLogger(name: string, minimum: Level = 'info'): Logger {
  const write = (level: Level, message: string, fields: Record<string, unknown> = {}) => {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minimum]) {
      return;
    }
    const line = JSON.stringify({ time: new Date().toISOString(), level, name, message, ...fields });
    process.stdout.write(`${line}\n`);
  };
  return {
    debug: (message, fields) => write('debug', message, fields),
    info: (message, fields) => write('info', message, fields),
    warn: (message, fields) => write('warn', message, fields),
    error: (message, fields) => write('error', message, fields),
  };
}
