CREATE TABLE vacations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id UUID NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  student_id UUID NULL REFERENCES students(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  personal_group_ids UUID[] NOT NULL DEFAULT '{}',
  notify_at TIMESTAMPTZ NOT NULL,
  notified_at TIMESTAMPTZ NULL,
  cancelled_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE INDEX vacations_tutor ON vacations (tutor_id, start_date);
CREATE INDEX vacations_tutor_student ON vacations (tutor_id, student_id)
  WHERE cancelled_at IS NULL;

CREATE TABLE vacation_hidden_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vacation_id UUID NOT NULL REFERENCES vacations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('lesson', 'personal_event')),
  original_id UUID NOT NULL,
  start_utc TIMESTAMPTZ NOT NULL,
  recurring_schedule_id UUID NULL,
  snapshot JSONB NOT NULL,
  restored_at TIMESTAMPTZ NULL
);

CREATE INDEX vacation_hidden_items_vacation ON vacation_hidden_items (vacation_id);
CREATE UNIQUE INDEX vacation_hidden_items_unrestored
  ON vacation_hidden_items (kind, original_id)
  WHERE restored_at IS NULL;

ALTER TABLE telegram_notification_outbox
  ADD COLUMN available_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE telegram_notification_outbox
  DROP CONSTRAINT telegram_notification_outbox_kind_check;

ALTER TABLE telegram_notification_outbox
  ADD CONSTRAINT telegram_notification_outbox_kind_check
  CHECK (kind IN ('reschedule', 'created', 'deleted', 'vacation', 'vacation_cancelled'));

CREATE INDEX telegram_notification_outbox_available_idx
  ON telegram_notification_outbox (available_at);
