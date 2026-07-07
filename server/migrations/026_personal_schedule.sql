CREATE TABLE personal_event_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id    UUID NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 40),
  color       TEXT NOT NULL CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX personal_event_groups_tutor ON personal_event_groups (tutor_id, sort_order);

CREATE TABLE recurring_personal_schedules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id        UUID NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  group_id        UUID NOT NULL REFERENCES personal_event_groups(id) ON DELETE RESTRICT,
  title           TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 80),
  weekdays        SMALLINT[] NOT NULL CHECK (array_length(weekdays, 1) >= 1),
  start_minutes   INT NOT NULL CHECK (start_minutes >= 0 AND start_minutes < 1440),
  duration_min    INT NOT NULL CHECK (duration_min >= 15 AND duration_min <= 480),
  notes           TEXT,
  interval_weeks  INT NOT NULL DEFAULT 1 CHECK (interval_weeks >= 1),
  start_date      DATE NOT NULL,
  end_date        DATE,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX recurring_personal_schedules_tutor ON recurring_personal_schedules (tutor_id);

CREATE TABLE personal_events (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id                        UUID NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  group_id                        UUID NOT NULL REFERENCES personal_event_groups(id) ON DELETE RESTRICT,
  title                           TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 80),
  start_utc                       TIMESTAMPTZ NOT NULL,
  duration_min                    INT NOT NULL CHECK (duration_min >= 15 AND duration_min <= 480),
  notes                           TEXT,
  recurring_personal_schedule_id  UUID REFERENCES recurring_personal_schedules(id) ON DELETE SET NULL,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX personal_events_tutor_start ON personal_events (tutor_id, start_utc);
CREATE INDEX personal_events_recurring ON personal_events (recurring_personal_schedule_id)
  WHERE recurring_personal_schedule_id IS NOT NULL;

CREATE UNIQUE INDEX personal_events_recurring_slot
  ON personal_events (recurring_personal_schedule_id, start_utc)
  WHERE recurring_personal_schedule_id IS NOT NULL;

CREATE TABLE recurring_personal_schedule_skips (
  recurring_personal_schedule_id UUID NOT NULL REFERENCES recurring_personal_schedules(id) ON DELETE CASCADE,
  start_utc                      TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (recurring_personal_schedule_id, start_utc)
);

CREATE TABLE tutor_working_hours (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id      UUID NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  weekday       SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_minutes INT NOT NULL CHECK (start_minutes >= 0 AND start_minutes < 1440),
  end_minutes   INT NOT NULL CHECK (end_minutes > 0 AND end_minutes <= 1440),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (start_minutes < end_minutes)
);

CREATE INDEX tutor_working_hours_tutor ON tutor_working_hours (tutor_id, weekday, start_minutes);
