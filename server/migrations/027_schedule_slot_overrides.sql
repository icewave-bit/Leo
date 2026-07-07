DROP TABLE IF EXISTS tutor_working_hours;

CREATE TABLE schedule_slot_overrides (
  tutor_id       UUID NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  weekday        SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_minutes  INT NOT NULL CHECK (start_minutes >= 0 AND start_minutes < 1440),
  blocked        BOOLEAN NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tutor_id, weekday, start_minutes)
);

CREATE INDEX schedule_slot_overrides_tutor ON schedule_slot_overrides (tutor_id);
