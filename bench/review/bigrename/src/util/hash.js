import { createHash } from 'node:crypto';

export function sha256Hex(text) {
  return createHash('sha256').update(text).digest('hex');
}

export function fingerprint(task) {
  return sha256Hex(`${task.kind}:${task.id}`).slice(0, 16);
}
