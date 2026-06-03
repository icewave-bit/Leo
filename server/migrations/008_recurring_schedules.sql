CREATE TABLE recurring_schedules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id        UUID NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  weekday         SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_minutes   INT NOT NULL CHECK (start_minutes >= 0 AND start_minutes < 1440),
  duration_min    INT NOT NULL CHECK (duration_min > 0),
  academic_units  SMALLINT NOT NULL CHECK (academic_units IN (1, 2)),
  type            TEXT NOT NULL DEFAULT 'solo' CHECK (type IN ('solo', 'group')),
  notes           TEXT,
  interval_weeks  INT NOT NULL DEFAULT 1 CHECK (interval_weeks >= 1),
  start_date      DATE NOT NULL,
  end_date        DATE,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX recurring_schedules_tutor ON recurring_schedules (tutor_id);

ALTER TABLE lessons
  ADD COLUMN recurring_schedule_id UUID REFERENCES recurring_schedules(id) ON DELETE SET NULL;

CREATE INDEX lessons_recurring ON lessons (recurring_schedule_id)
  WHERE recurring_schedule_id IS NOT NULL;

CREATE UNIQUE INDEX lessons_recurring_slot
  ON lessons (recurring_schedule_id, start_utc)
  WHERE recurring_schedule_id IS NOT NULL;
