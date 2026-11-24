import type { IncomingOrder } from '../types.js';

const MAX_EXTERNAL_REF_LENGTH = 64;
const MAX_TOTAL = 1_000_000;

export function validateIncomingOrder(input: unknown): IncomingOrder {
  if (typeof input !== 'object' || input === null) {
    throw new ValidationError('body must be an object');
  }
  const body = input as Record<string, unknown>;
  const externalRef = requireString(body.externalRef, 'externalRef');
  if (externalRef.length > MAX_EXTERNAL_REF_LENGTH) {
    throw new ValidationError('externalRef too long');
  }
  const customerId = requireInteger(body.customerId, 'customerId');
  const total = requireNumber(body.total, 'total');
  if (total < 0) {
    throw new ValidationError('total must not be negative');
  }
  if (total > MAX_TOTAL) {
    throw new ValidationError('total exceeds limit');
  }
  return { externalRef, customerId, total };
}

export class ValidationError extends Error {
  readonly status = 400;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function requireInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new ValidationError(`${field} must be a positive integer`);
  }
  return value as number;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new ValidationError(`${field} must be a number`);
  }
  return value;
}
