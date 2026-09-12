CREATE TABLE telegram_notification_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('reschedule')),
  telegram_user_id BIGINT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('tutor', 'student')),
  entity_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX telegram_notification_outbox_created_idx
  ON telegram_notification_outbox (created_at);
