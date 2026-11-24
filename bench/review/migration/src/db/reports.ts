import { pool } from './client.js';

export async function countPending(customerId: number): Promise<number> {
  const result = await pool.query(
    "SELECT count(*)::int AS n FROM orders WHERE customer_id = $1 AND status = 'pending'",
    [customerId],
  );
  return result.rows[0].n;
}

export async function countShipped(customerId: number): Promise<number> {
  const result = await pool.query(
    "SELECT count(*)::int AS n FROM orders WHERE customer_id = $1 AND status = 'shipped'",
    [customerId],
  );
  return result.rows[0].n;
}
