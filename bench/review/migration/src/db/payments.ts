import { pool } from './client.js';

export interface PaymentRecord {
  id: number;
  orderId: number;
  amountCents: number;
  method: string;
}

export async function recordPayment(orderId: number, amountCents: number, method: string): Promise<number> {
  const result = await pool.query(
    'INSERT INTO payments (order_id, amount_cents, method) VALUES ($1, $2, $3) RETURNING id',
    [orderId, amountCents, method],
  );
  return result.rows[0].id;
}

export async function paymentsForOrder(orderId: number): Promise<PaymentRecord[]> {
  const result = await pool.query(
    'SELECT id, order_id, amount_cents, method FROM payments WHERE order_id = $1 ORDER BY id',
    [orderId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    orderId: row.order_id,
    amountCents: Number(row.amount_cents),
    method: row.method,
  }));
}

export async function refundedTotal(orderId: number): Promise<number> {
  const result = await pool.query(
    "SELECT COALESCE(SUM(amount_cents), 0)::bigint AS total FROM payments WHERE order_id = $1 AND method = 'refund'",
    [orderId],
  );
  return Number(result.rows[0].total);
}
