import { nextBatch } from './priority.js';

export function createBacklog(limit = 100) {
  const entries = [];

  return {
    add(task) {
      if (entries.length >= limit) return false;
      entries.push(task);
      return true;
    },
    take(size) {
      const batch = nextBatch(entries, size);
      for (const task of batch) {
        entries.splice(entries.indexOf(task), 1);
      }
      return batch;
    },
    size() {
      return entries.length;
    },
  };
}
