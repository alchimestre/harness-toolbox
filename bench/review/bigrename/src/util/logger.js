const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

export function createLogger({ level = 'info', sink = console, fields = {} } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;

  function emit(name, message, extra) {
    if (LEVELS[name] < threshold) return;
    const record = { time: new Date().toISOString(), level: name, message, ...fields, ...extra };
    sink.log(JSON.stringify(record));
  }

  return {
    debug: (message, extra) => emit('debug', message, extra),
    info: (message, extra) => emit('info', message, extra),
    warn: (message, extra) => emit('warn', message, extra),
    error: (message, extra) => emit('error', message, extra),
    child(extraFields) {
      return createLogger({ level, sink, fields: { ...fields, ...extraFields } });
    },
  };
}
