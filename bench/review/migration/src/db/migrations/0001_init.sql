CREATE TABLE customers (
  id serial PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE orders (
  id serial PRIMARY KEY,
  external_ref text NOT NULL,
  customer_id integer NOT NULL REFERENCES customers (id),
  total numeric(10, 2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'
);

CREATE UNIQUE INDEX orders_external_ref_key ON orders (external_ref);
CREATE INDEX orders_customer_status_idx ON orders (customer_id, status);

CREATE TABLE payments (
  id serial PRIMARY KEY,
  order_id integer NOT NULL REFERENCES orders (id),
  amount_cents bigint NOT NULL,
  method text NOT NULL
);

CREATE TABLE audit_log (
  id serial PRIMARY KEY,
  event_name text NOT NULL,
  subject_id integer NOT NULL,
  payload jsonb NOT NULL
);

CREATE TABLE shipments (
  id serial PRIMARY KEY,
  order_id integer NOT NULL REFERENCES orders (id),
  carrier text NOT NULL,
  tracking_code text,
  state text NOT NULL DEFAULT 'queued'
);
