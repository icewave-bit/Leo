ALTER TABLE tutors
  ADD COLUMN IF NOT EXISTS telegram_notify_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS telegram_notify_lead_minutes INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS telegram_notify_silent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS telegram_notify_lessons BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS telegram_notify_personal BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tutors_telegram_notify_lead_minutes_check'
  ) THEN
    ALTER TABLE tutors
      ADD CONSTRAINT tutors_telegram_notify_lead_minutes_check
      CHECK (telegram_notify_lead_minutes IN (5, 10, 15, 30, 60));
  END IF;
END $$;
