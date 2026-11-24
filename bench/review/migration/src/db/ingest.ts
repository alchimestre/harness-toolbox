import { pool } from './client.js';
import type { IncomingOrder } from '../types.js';

export async function ingestOrder(order: IncomingOrder): Promise<'inserted' | 'duplicate'> {
  const result = await pool.query(
    `INSERT INTO orders (external_ref, customer_id, total_cents, status)
     VALUES ($1, $2, $3, 'awaiting_payment')
     ON CONFLICT (external_ref) DO NOTHING`,
    [order.externalRef, order.customerId, toCents(order.total)],
  );
  return result.rowCount === 1 ? 'inserted' : 'duplicate';
}

function toCents(total: number): number {
  return Math.round(total * 100);
}
