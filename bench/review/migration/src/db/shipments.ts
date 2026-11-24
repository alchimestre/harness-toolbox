import { pool } from './client.js';

export type ShipmentState = 'queued' | 'dispatched' | 'delivered' | 'returned';

export interface Shipment {
  id: number;
  orderId: number;
  carrier: string;
  trackingCode: string | null;
  state: ShipmentState;
}

export async function createShipment(orderId: number, carrier: string): Promise<number> {
  const result = await pool.query(
    "INSERT INTO shipments (order_id, carrier, state) VALUES ($1, $2, 'queued') RETURNING id",
    [orderId, carrier],
  );
  return result.rows[0].id;
}

export async function dispatch(shipmentId: number, trackingCode: string): Promise<boolean> {
  const result = await pool.query(
    "UPDATE shipments SET state = 'dispatched', tracking_code = $2 WHERE id = $1 AND state = 'queued'",
    [shipmentId, trackingCode],
  );
  return result.rowCount === 1;
}

export async function markDelivered(shipmentId: number): Promise<boolean> {
  const result = await pool.query(
    "UPDATE shipments SET state = 'delivered' WHERE id = $1 AND state = 'dispatched'",
    [shipmentId],
  );
  return result.rowCount === 1;
}

export async function shipmentsForOrder(orderId: number): Promise<Shipment[]> {
  const result = await pool.query(
    'SELECT id, order_id, carrier, tracking_code, state FROM shipments WHERE order_id = $1 ORDER BY id',
    [orderId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    orderId: row.order_id,
    carrier: row.carrier,
    trackingCode: row.tracking_code,
    state: row.state,
  }));
}
