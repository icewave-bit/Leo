ALTER TABLE tutors
  ADD COLUMN academic_hour_min INTEGER NOT NULL DEFAULT 60
  CHECK (academic_hour_min > 0 AND academic_hour_min <= 180);

ALTER TABLE lessons
  ADD COLUMN academic_units SMALLINT NOT NULL DEFAULT 1
  CHECK (academic_units IN (1, 2));

UPDATE lessons l
SET academic_units = CASE
  WHEN l.duration_min >= (
    SELECT t.academic_hour_min * 1.5 FROM tutors t WHERE t.id = l.tutor_id
  ) THEN 2
  ELSE 1
END;
