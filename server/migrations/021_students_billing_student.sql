ALTER TABLE students
  ADD COLUMN billing_student_id UUID REFERENCES students(id) ON DELETE RESTRICT,
  ADD CONSTRAINT students_billing_not_self
    CHECK (billing_student_id IS NULL OR billing_student_id != id);

CREATE INDEX students_billing_student ON students (billing_student_id)
  WHERE billing_student_id IS NOT NULL;

ALTER TABLE balance_movements
  ADD COLUMN charged_for_student_id UUID REFERENCES students(id) ON DELETE SET NULL;

CREATE INDEX balance_movements_charged_for
  ON balance_movements (charged_for_student_id)
  WHERE charged_for_student_id IS NOT NULL;
