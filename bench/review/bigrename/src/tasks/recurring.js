import { parseDuration } from '../util/duration.js';

export function createRecurring({ every, job, onError = console.error }) {
  const intervalMs = typeof every === 'string' ? parseDuration(every) : every;
  let timer = null;

  function tick() {
    Promise.resolve()
      .then(job)
      .catch((error) => onError(error));
  }

  return {
    start() {
      if (timer) return;
      timer = setInterval(tick, intervalMs);
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    },
    get running() {
      return timer !== null;
    },
  };
}
