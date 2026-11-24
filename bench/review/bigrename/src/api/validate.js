const MAX_ID_LENGTH = 128;

export function validateTaskBody(body) {
  if (typeof body.id !== 'string' || body.id.length === 0) return 'id must be a non-empty string';
  if (body.id.length > MAX_ID_LENGTH) return `id exceeds ${MAX_ID_LENGTH} characters`;
  return null;
}

export function validateDelay(value) {
  if (value === undefined) return null;
  if (!Number.isInteger(value) || value < 0) return 'delayMs must be a non-negative integer';
  return null;
}
