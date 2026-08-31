CREATE TABLE telegram_sent_reminders (
  telegram_user_id BIGINT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('lesson', 'personal')),
  entity_id UUID NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (telegram_user_id, kind, entity_id)
);
