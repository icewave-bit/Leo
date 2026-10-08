ALTER TABLE personal_event_groups
  ADD COLUMN default_duration_min INT NOT NULL DEFAULT 60
    CHECK (default_duration_min >= 15 AND default_duration_min <= 480);
