import { customerSummary, topCustomers } from '../db/order_summary.js';
import { exportOrders } from '../db/order_export.js';
import type { HttpRequest, HttpResponse } from './routes.js';

const DEFAULT_TOP_LIMIT = 10;
const DEFAULT_DISCOUNT_PERCENT = 5;

export async function getCustomerSummary(req: HttpRequest, res: HttpResponse): Promise<void> {
  const customerId = Number(req.params.customerId);
  const summary = await customerSummary(customerId, DEFAULT_DISCOUNT_PERCENT);
  res.status(200).json(summary);
}

export async function getTopCustomers(_req: HttpRequest, res: HttpResponse): Promise<void> {
  const summaries = await topCustomers(DEFAULT_TOP_LIMIT);
  res.status(200).json({ customers: summaries });
}

export async function getOrderExport(req: HttpRequest, res: HttpResponse): Promise<void> {
  const customerId = req.params.customerId ? Number(req.params.customerId) : null;
  const rows = await exportOrders(customerId);
  res.status(200).json({ rows });
}
