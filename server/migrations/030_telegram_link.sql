ALTER TABLE tutors
  ADD COLUMN IF NOT EXISTS telegram_user_id BIGINT,
  ADD COLUMN IF NOT EXISTS telegram_username TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS tutors_telegram_user_id_key
  ON tutors (telegram_user_id);

CREATE TABLE IF NOT EXISTS telegram_link_codes (
  code       TEXT PRIMARY KEY,
  tutor_id   UUID NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS telegram_link_codes_tutor_id_idx ON telegram_link_codes (tutor_id);
CREATE INDEX IF NOT EXISTS telegram_link_codes_expires_at_idx ON telegram_link_codes (expires_at);
