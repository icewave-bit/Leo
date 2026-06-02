ALTER TABLE students
  ADD COLUMN balance_kind TEXT NOT NULL DEFAULT 'money'
  CHECK (balance_kind IN ('money', 'lessons'));
