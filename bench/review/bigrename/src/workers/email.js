import { sleep } from '../util/time.js';

export async function emailHandler(payload) {
  const { to, subject, body } = payload;
  if (!to) {
    throw Object.assign(new Error('missing recipient'), { retryable: false });
  }
  await sleep(10);
  return { sent: true, to, subject, length: body.length };
}

export function scheduleReminder(scheduler, payload, { delayMs = 60000 } = {}) {
  const task = { id: `reminder-${payload.to}`, kind: 'email', payload, handler: emailHandler };
  return scheduler.enqueue(task, delayMs);
}
