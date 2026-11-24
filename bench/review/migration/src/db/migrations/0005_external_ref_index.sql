DROP INDEX orders_external_ref_key;
CREATE INDEX orders_external_ref_idx ON orders (external_ref);
ALTER TABLE customers ADD COLUMN tier text NOT NULL;

-- down
ALTER TABLE customers DROP COLUMN tier;
DROP INDEX orders_external_ref_idx;
CREATE UNIQUE INDEX orders_external_ref_key ON orders (external_ref);
