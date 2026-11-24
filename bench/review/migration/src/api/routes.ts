import { validateIncomingOrder, ValidationError } from './validate.js';
import { ingestOrder } from '../db/ingest.js';
import { findByRef, listByCustomer, markPaid } from '../db/orders.js';
import { logEvent } from '../db/audit.js';
import { recordPayment } from '../db/payments.js';
import { createLogger } from '../lib/logger.js';
import type { Order } from '../types.js';

const log = createLogger('orders');

export interface HttpRequest {
  body: unknown;
  params: Record<string, string>;
}

export interface HttpResponse {
  status(code: number): HttpResponse;
  json(body: unknown): void;
}

export async function postOrder(req: HttpRequest, res: HttpResponse): Promise<void> {
  const order = validateIncomingOrder(req.body);
  const outcome = await ingestOrder(order);
  await logEvent('order.ingested', order.customerId, { externalRef: order.externalRef, outcome });
  log.info('order processed', { externalRef: order.externalRef, outcome });
  res.status(outcome === 'inserted' ? 201 : 200).json({ outcome });
}

export async function getOrderByRef(req: HttpRequest, res: HttpResponse): Promise<void> {
  const order = await findByRef(req.params.ref);
  if (!order) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.status(200).json(toApiOrder(order));
}

export async function listOrders(req: HttpRequest, res: HttpResponse): Promise<void> {
  const customerId = Number(req.params.customerId);
  const orders: Order[] = await listByCustomer(customerId);
  res.status(200).json({ orders: orders.map(toApiOrder) });
}

export async function payOrder(req: HttpRequest, res: HttpResponse): Promise<void> {
  const id = Number(req.params.id);
  const body = req.body as { amountCents?: unknown; method?: unknown };
  if (!Number.isInteger(body.amountCents) || typeof body.method !== 'string') {
    throw new ValidationError('amountCents and method are required');
  }
  const paid = await markPaid(id);
  if (!paid) {
    res.status(409).json({ error: 'order is not payable' });
    return;
  }
  await recordPayment(id, body.amountCents as number, body.method);
  res.status(200).json({ paid: true });
}

function toApiOrder(order: Order) {
  return {
    id: order.id,
    external_ref: order.external_ref,
    customer_id: order.customer_id,
    total: order.total_cents / 100,
    status: order.status,
  };
}

export function handleError(error: unknown, res: HttpResponse): void {
  if (error instanceof ValidationError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  log.error('unhandled error', { message: String(error) });
  res.status(500).json({ error: 'internal error' });
}
