ALTER TABLE students
  ADD COLUMN IF NOT EXISTS telegram_user_id BIGINT,
  ADD COLUMN IF NOT EXISTS telegram_username TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS students_telegram_user_id_key
  ON students (telegram_user_id)
  WHERE telegram_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS students_telegram_username_lower_key
  ON students (LOWER(telegram_username))
  WHERE telegram_username IS NOT NULL;
