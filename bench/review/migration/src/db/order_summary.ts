import { pool } from './client.js';
import { percentOf } from '../api/money.js';

export interface CustomerSummary {
  customerId: number;
  orderCount: number;
  paidCents: number;
  discountCents: number;
}

export async function customerSummary(customerId: number, discountPercent: number): Promise<CustomerSummary> {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS order_count,
            COALESCE(SUM(total_cents) FILTER (WHERE status = 'paid'), 0)::bigint AS paid_cents
       FROM orders
      WHERE customer_id = $1`,
    [customerId],
  );
  const row = result.rows[0];
  const paidCents = Number(row.paid_cents);
  return {
    customerId,
    orderCount: row.order_count,
    paidCents,
    discountCents: percentOf(paidCents, discountPercent),
  };
}

export async function topCustomers(limit: number): Promise<CustomerSummary[]> {
  const result = await pool.query(
    `SELECT customer_id, COUNT(*)::int AS order_count,
            COALESCE(SUM(total_cents) FILTER (WHERE status = 'paid'), 0)::bigint AS paid_cents
       FROM orders
      GROUP BY customer_id
      ORDER BY paid_cents DESC
      LIMIT $1`,
    [limit],
  );
  return result.rows.map((row) => ({
    customerId: row.customer_id,
    orderCount: row.order_count,
    paidCents: Number(row.paid_cents),
    discountCents: 0,
  }));
}
