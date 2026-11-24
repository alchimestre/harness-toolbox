import { createScheduler } from './tasks/index.js';
import { startHttp } from './api/routes.js';
import { defaults } from './config.js';

export async function main(overrides = {}) {
  const config = Object.assign({}, defaults, overrides);
  const scheduler = createScheduler(config);
  const server = await startHttp({ scheduler, port: config.port });
  return { scheduler, server };
}
