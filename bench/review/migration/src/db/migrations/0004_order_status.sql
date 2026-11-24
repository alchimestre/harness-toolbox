ALTER TABLE orders DROP CONSTRAINT orders_status_check;
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'awaiting_payment';
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('awaiting_payment', 'paid', 'shipped', 'cancelled'));

-- down
ALTER TABLE orders DROP CONSTRAINT orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status = ANY (ARRAY['pending', 'paid', 'shipped', 'cancelled']));
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'pending';
UPDATE orders SET status = 'pending' WHERE status = 'awaiting_payment';
