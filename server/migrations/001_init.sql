CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE tutors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  email           TEXT NOT NULL,
  password_hash   TEXT NOT NULL,
  name            TEXT NOT NULL,
  initials        TEXT NOT NULL,
  subject         TEXT,
  timezone        TEXT NOT NULL DEFAULT 'UTC',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tutors_email_lower ON tutors (LOWER(email));

CREATE TABLE students (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id   UUID NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  initials   TEXT NOT NULL,
  hue        INTEGER NOT NULL DEFAULT 250 CHECK (hue BETWEEN 0 AND 360),
  tz         TEXT NOT NULL DEFAULT 'UTC',
  meet_url   TEXT,
  rate       NUMERIC(10,2) CHECK (rate IS NULL OR rate >= 0),
  currency   TEXT NOT NULL DEFAULT 'EUR',
  note       TEXT,
  is_group   BOOLEAN NOT NULL DEFAULT false,
  members    TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX students_tutor ON students (tutor_id);

CREATE TABLE lessons (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id     UUID NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  student_id   UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  start_utc    TIMESTAMPTZ NOT NULL,
  duration_min INTEGER NOT NULL CHECK (duration_min > 0),
  status       TEXT NOT NULL DEFAULT 'planned'
               CHECK (status IN ('planned','completed','cancelled','no_show')),
  type         TEXT NOT NULL DEFAULT 'solo' CHECK (type IN ('solo','group')),
  paid         BOOLEAN NOT NULL DEFAULT false,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX lessons_student ON lessons (student_id);
CREATE INDEX lessons_schedule ON lessons (tutor_id, start_utc, status);
