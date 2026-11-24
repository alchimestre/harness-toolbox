import { pool } from './client.js';
import type { Order } from '../types.js';

export async function findByRef(externalRef: string): Promise<Order | null> {
  const result = await pool.query(
    'SELECT id, external_ref, customer_id, total_cents, status FROM orders WHERE external_ref = $1',
    [externalRef],
  );
  return result.rows.at(0) ?? null;
}

export async function listByCustomer(customerId: number): Promise<Order[]> {
  const result = await pool.query(
    'SELECT id, external_ref, customer_id, total_cents, status FROM orders WHERE customer_id = $1 ORDER BY id',
    [customerId],
  );
  return result.rows;
}

export async function markPaid(id: number): Promise<boolean> {
  const result = await pool.query(
    "UPDATE orders SET status = 'paid' WHERE id = $1 AND status = 'awaiting_payment'",
    [id],
  );
  return result.rowCount === 1;
}
