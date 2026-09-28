ALTER TABLE telegram_notification_outbox
  DROP CONSTRAINT IF EXISTS telegram_notification_outbox_entity_id_fkey;

ALTER TABLE telegram_notification_outbox
  DROP CONSTRAINT telegram_notification_outbox_kind_check;

ALTER TABLE telegram_notification_outbox
  ADD CONSTRAINT telegram_notification_outbox_kind_check
  CHECK (kind IN ('reschedule', 'created', 'deleted'));
