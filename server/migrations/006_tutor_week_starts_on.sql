ALTER TABLE tutors
  ADD COLUMN week_starts_on TEXT NOT NULL DEFAULT 'monday'
  CHECK (week_starts_on IN ('monday', 'sunday'));
