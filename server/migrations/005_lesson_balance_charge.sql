ALTER TABLE lessons
  ADD COLUMN balance_charged BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN charge_prepaid_delta NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (charge_prepaid_delta >= 0),
  ADD COLUMN charge_debt_delta NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (charge_debt_delta >= 0);
