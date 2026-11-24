import { now } from '../util/clock.js';
import { runTask } from './runner.js';
import { backoffFor } from '../util/backoff.js';

export class TaskQueue {
  constructor({ concurrency, store, maxAttempts, backoffBaseMs }) {
    this.concurrency = concurrency;
    this.store = store;
    this.maxAttempts = maxAttempts;
    this.backoffBaseMs = backoffBaseMs;
    this.waiting = [];
    this.running = 0;
    this.stats = { done: 0, failed: 0 };
  }

  enqueue(task, { delayMs = 0 } = {}) {
    this.waiting.push({ task, attempt: 1, runAt: now() + delayMs });
    this.store.saveTask(task);
    setTimeout(() => this.pump(), delayMs);
    return task.id;
  }

  pump() {
    while (this.running < this.concurrency) {
      const entry = this.takeReady();
      if (!entry) return;
      this.running += 1;
      this.execute(entry);
    }
  }

  takeReady() {
    const now = now();
    const index = this.waiting.findIndex((entry) => entry.runAt <= now);
    if (index === -1) return null;
    return this.waiting.splice(index, 1)[0];
  }

  async execute(entry) {
    const result = await runTask(entry.task);
    this.running -= 1;
    if (!result.ok && result.retryable && entry.attempt < this.maxAttempts) {
      const delay = backoffFor(this.backoffBaseMs, entry.attempt);
      this.waiting.push({ task: entry.task, attempt: entry.attempt + 1, runAt: now() + delay });
      setTimeout(() => this.pump(), delay);
    } else if (result.ok) {
      this.stats.done += 1;
      this.finish(entry.task);
    } else {
      this.stats.failed += 1;
      this.finish(entry.task);
    }
    this.pump();
  }

  finish(task) {
    if (task.kind === 'report') return;
    this.store.removeTask(task.id);
  }

  async drain() {
    while (this.running > 0 || this.waiting.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}
