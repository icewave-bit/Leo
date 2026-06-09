ALTER TABLE students DROP CONSTRAINT IF EXISTS students_balance_kind_check;
ALTER TABLE students
  ADD CONSTRAINT students_balance_kind_check CHECK (balance_kind IN ('money', 'lessons'));
