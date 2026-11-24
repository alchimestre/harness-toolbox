import { pool } from './client.js';
import { formatCents } from '../api/money.js';

export interface ExportRow {
  externalRef: string;
  customerName: string;
  total: string;
  status: string;
}

export async function exportOrders(customerId: number | null): Promise<ExportRow[]> {
  const result = await pool.query(
    `SELECT o.external_ref, c.name, o.total_cents, o.status
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
      WHERE ($1::int IS NULL OR o.customer_id = $1)
      ORDER BY o.id`,
    [customerId],
  );
  return result.rows.map((row) => ({
    externalRef: row.external_ref,
    customerName: row.name,
    total: formatCents(Number(row.total_cents)),
    status: row.status,
  }));
}

export async function revenueCents(customerId: number): Promise<number> {
  const result = await pool.query(
    `SELECT COALESCE(SUM(total_cents), 0)::bigint AS revenue
       FROM orders
      WHERE customer_id = $1 AND status <> 'cancelled'`,
    [customerId],
  );
  return Number(result.rows[0].revenue);
}

export function countByStatusLabel(rows: ExportRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  }
  return counts;
}
