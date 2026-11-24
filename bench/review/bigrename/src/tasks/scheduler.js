import { TaskQueue } from './queue.js';
import { createStore } from './store.js';

export function createScheduler(config) {
  const store = createStore(config.storeFile);
  const queue = new TaskQueue({
    concurrency: config.concurrency,
    store,
    maxAttempts: config.maxAttempts,
    backoffBaseMs: config.backoffBaseMs,
  });
  return {
    store,
    queue,
    enqueue(task, delayMs) {
      return queue.enqueue(task, { delayMs });
    },
    stats() {
      return { ...queue.stats, waiting: queue.waiting.length };
    },
    async stop() {
      queue.drain();
      await store.close();
    },
  };
}
