export type OrderStatus = 'awaiting_payment' | 'paid' | 'shipped' | 'cancelled';

export interface Order {
  id: number;
  external_ref: string;
  customer_id: number;
  status: OrderStatus;
  total_cents: number;
}

export interface IncomingOrder {
  externalRef: string;
  customerId: number;
  total: number;
}
