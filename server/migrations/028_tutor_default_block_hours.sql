ALTER TABLE tutors
  ADD COLUMN default_block_start_minutes SMALLINT NOT NULL DEFAULT 1320,
  ADD COLUMN default_block_end_minutes SMALLINT NOT NULL DEFAULT 480;

ALTER TABLE tutors
  ADD CONSTRAINT tutors_default_block_start_range
    CHECK (default_block_start_minutes >= 0 AND default_block_start_minutes <= 1380),
  ADD CONSTRAINT tutors_default_block_end_range
    CHECK (default_block_end_minutes >= 0 AND default_block_end_minutes <= 1380),
  ADD CONSTRAINT tutors_default_block_start_hour_aligned
    CHECK (default_block_start_minutes % 60 = 0),
  ADD CONSTRAINT tutors_default_block_end_hour_aligned
    CHECK (default_block_end_minutes % 60 = 0);
