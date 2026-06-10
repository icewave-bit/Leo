ALTER TABLE tax_replenishment_meta
  ADD COLUMN manual_currency TEXT,
  ADD COLUMN manual_amount NUMERIC(12, 2);
