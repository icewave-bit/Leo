ALTER TABLE telegram_notification_outbox
  DROP CONSTRAINT telegram_notification_outbox_kind_check;

ALTER TABLE telegram_notification_outbox
  ADD CONSTRAINT telegram_notification_outbox_kind_check
  CHECK (kind IN ('reschedule', 'created'));
