ALTER TABLE orders ADD COLUMN total_cents bigint;
UPDATE orders SET total_cents = round(total * 100);
ALTER TABLE orders ALTER COLUMN total_cents SET NOT NULL;
ALTER TABLE orders ALTER COLUMN total_cents SET DEFAULT 0;
ALTER TABLE orders DROP COLUMN total;

-- down
ALTER TABLE orders ADD COLUMN total numeric(10, 2) NOT NULL DEFAULT 0;
UPDATE orders SET total = total_cents / 100;
ALTER TABLE orders DROP COLUMN total_cents;
