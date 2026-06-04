ALTER TABLE tutors
  ADD COLUMN default_replenish_balance_kind TEXT NOT NULL DEFAULT 'money'
  CHECK (default_replenish_balance_kind IN ('money', 'lessons'));
