'use strict';

function parseArgs(argv) {
  const opts = { file: null, level: 'info', format: 'lines', since: null, stats: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--stats') {
      opts.stats = true;
    } else if (arg === '--level') {
      opts.level = argv[++i];
    } else if (arg === '--format' || arg === '-f') {
      opts.format = argv[++i];
    } else if (arg === '--since') {
      opts.since = argv[++i];
    } else if (!arg.startsWith('-')) {
      opts.file = arg;
    } else {
      throw new Error(`unknown option ${arg}`);
    }
  }
  return opts;
}

module.exports = { parseArgs };
