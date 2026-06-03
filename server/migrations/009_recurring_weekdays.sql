ALTER TABLE recurring_schedules
  ADD COLUMN weekdays SMALLINT[] NOT NULL DEFAULT '{0}';

UPDATE recurring_schedules SET weekdays = ARRAY[weekday];

ALTER TABLE recurring_schedules
  DROP COLUMN weekday,
  ALTER COLUMN weekdays DROP DEFAULT;

ALTER TABLE recurring_schedules
  ADD CONSTRAINT recurring_schedules_weekdays_nonempty
    CHECK (cardinality(weekdays) >= 1);

ALTER TABLE recurring_schedules
  ADD CONSTRAINT recurring_schedules_weekdays_range
    CHECK (weekdays <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::SMALLINT[]);
