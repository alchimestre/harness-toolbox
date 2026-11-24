import { createShipment, dispatch, markDelivered, shipmentsForOrder } from '../db/shipments.js';
import { ValidationError } from './validate.js';

const KNOWN_CARRIERS = new Set(['ups', 'dhl', 'postnl']);

export async function postShipment(body: unknown): Promise<{ id: number }> {
  const input = body as { orderId?: unknown; carrier?: unknown };
  if (!Number.isInteger(input.orderId)) {
    throw new ValidationError('orderId must be an integer');
  }
  if (typeof input.carrier !== 'string' || !KNOWN_CARRIERS.has(input.carrier)) {
    throw new ValidationError('unknown carrier');
  }
  const id = await createShipment(input.orderId as number, input.carrier);
  return { id };
}

export async function dispatchShipment(id: number, trackingCode: unknown): Promise<boolean> {
  if (typeof trackingCode !== 'string' || trackingCode.length < 6) {
    throw new ValidationError('tracking code too short');
  }
  return dispatch(id, trackingCode);
}

export async function deliverShipment(id: number): Promise<boolean> {
  return markDelivered(id);
}

export async function listShipments(orderId: number) {
  return shipmentsForOrder(orderId);
}
