import { pool } from './client.js';

export interface RefundRequest {
  orderId: number;
  amountCents: number;
  reason: string;
}

export async function createRefund(request: RefundRequest): Promise<number> {
  const result = await pool.query(
    'INSERT INTO payments (order_id, amount_cents, method) VALUES ($1, $2, $3) RETURNING id',
    [request.orderId, request.amountCents, 'refund'],
  );
  return result.rows[0].id;
}

export async function refundableCents(orderId: number, totalCents: number): Promise<number> {
  const result = await pool.query(
    "SELECT COALESCE(SUM(amount_cents), 0)::bigint AS refunded FROM payments WHERE order_id = $1 AND method = 'refund'",
    [orderId],
  );
  return Math.max(0, totalCents - Number(result.rows[0].refunded));
}

export async function refundsForCustomer(customerId: number): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS n
       FROM payments p
       JOIN orders o ON o.id = p.order_id
      WHERE o.customer_id = $1 AND p.method = 'refund'`,
    [customerId],
  );
  return result.rows[0].n;
}
