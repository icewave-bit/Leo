ALTER TABLE students
  ADD COLUMN archived_at TIMESTAMPTZ;

CREATE INDEX students_tutor_active ON students (tutor_id) WHERE archived_at IS NULL;
CREATE INDEX students_tutor_archived ON students (tutor_id, archived_at DESC) WHERE archived_at IS NOT NULL;
