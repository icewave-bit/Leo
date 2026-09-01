CREATE TABLE activity_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id        UUID NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  status          TEXT NOT NULL CHECK (status IN ('ok', 'error')),
  actor           TEXT NOT NULL CHECK (actor IN ('user', 'system', 'bot')),
  action          TEXT NOT NULL,
  entity_type     TEXT NOT NULL,
  entity_id       UUID,
  entity_label    TEXT,
  student_id      UUID,
  summary         TEXT NOT NULL,
  details         JSONB NOT NULL DEFAULT '{}',
  error_code      TEXT,
  error_message   TEXT,
  http_method     TEXT,
  http_path       TEXT,
  http_status     INTEGER
);

CREATE INDEX activity_logs_tutor_occurred
  ON activity_logs (tutor_id, occurred_at DESC);
CREATE INDEX activity_logs_tutor_student
  ON activity_logs (tutor_id, student_id, occurred_at DESC)
  WHERE student_id IS NOT NULL;
