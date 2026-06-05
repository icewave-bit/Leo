ALTER TABLE tutors
  ADD COLUMN hidden_weekdays SMALLINT[] NOT NULL DEFAULT '{}';

ALTER TABLE tutors
  ADD CONSTRAINT tutors_hidden_weekdays_range
    CHECK (hidden_weekdays <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::SMALLINT[]);

ALTER TABLE tutors
  ADD CONSTRAINT tutors_hidden_weekdays_not_all
    CHECK (cardinality(hidden_weekdays) <= 6);
