ALTER TABLE balance_movements
  ADD COLUMN balance_kind TEXT NOT NULL DEFAULT 'money'
  CHECK (balance_kind IN ('money', 'lessons'));

UPDATE balance_movements m
SET balance_kind = s.balance_kind
FROM students s
WHERE s.id = m.student_id;
