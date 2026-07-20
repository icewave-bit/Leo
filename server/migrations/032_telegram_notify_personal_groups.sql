ALTER TABLE tutors
  ADD COLUMN IF NOT EXISTS telegram_notify_personal_group_ids UUID[] NOT NULL DEFAULT '{}';
