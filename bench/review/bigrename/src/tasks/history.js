export function createHistory(limit = 500) {
  const events = [];

  function record(type, task, extra = {}) {
    events.push({ type, id: task.id, kind: task.kind, at: Date.now(), ...extra });
    if (events.length > limit) events.splice(0, events.length - limit);
  }

  return {
    recordEnqueued(task) {
      record('enqueued', task);
    },
    recordFinished(task, ok) {
      record('finished', task, { ok });
    },
    recent(count = 20) {
      return events.slice(-count);
    },
    countByType() {
      const counts = {};
      for (const event of events) {
        counts[event.type] = (counts[event.type] ?? 0) + 1;
      }
      return counts;
    },
  };
}
