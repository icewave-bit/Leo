ALTER TABLE tutors
  ADD COLUMN tax_rate_percent NUMERIC(5, 2) NOT NULL DEFAULT 0
    CHECK (tax_rate_percent >= 0 AND tax_rate_percent <= 100),
  ADD COLUMN tax_display_currency TEXT NOT NULL DEFAULT 'BYN'
    CHECK (tax_display_currency IN ('BYN', 'none'));
