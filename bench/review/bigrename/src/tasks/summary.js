export function summarize(scheduler) {
  const stats = scheduler.stats();
  const outstanding = stats.waiting + scheduler.queue.running;
  return { ...stats, outstanding, idle: outstanding === 0 };
}

export function countByKind(scheduler) {
  const counts = {};
  for (const task of scheduler.store.list()) {
    counts[task.kind] = (counts[task.kind] ?? 0) + 1;
  }
  return counts;
}
