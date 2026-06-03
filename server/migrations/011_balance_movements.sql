CREATE TABLE balance_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id        UUID NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  lesson_id       UUID REFERENCES lessons(id) ON DELETE SET NULL,
  occurred_at     TIMESTAMPTZ NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN (
    'replenish', 'manual', 'lesson_charge', 'lesson_paid', 'lesson_reverse'
  )),
  prepaid_delta   NUMERIC(12, 2) NOT NULL DEFAULT 0,
  debt_delta      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  prepaid_after   NUMERIC(12, 2) NOT NULL,
  debt_after      NUMERIC(12, 2) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX balance_movements_student_time
  ON balance_movements (student_id, occurred_at DESC);
CREATE INDEX balance_movements_tutor_time
  ON balance_movements (tutor_id, occurred_at DESC);

-- Backfill from existing lesson charges (approximate occurred_at = lesson start).
INSERT INTO balance_movements (
  tutor_id, student_id, lesson_id, occurred_at, kind,
  prepaid_delta, debt_delta, prepaid_after, debt_after
)
SELECT
  l.tutor_id,
  l.student_id,
  l.id,
  l.start_utc,
  'lesson_charge',
  -l.charge_prepaid_delta,
  l.charge_debt_delta,
  0,
  0
FROM lessons l
JOIN students s ON s.id = l.student_id
WHERE l.balance_charged = true
  AND (l.charge_prepaid_delta > 0 OR l.charge_debt_delta > 0);

INSERT INTO balance_movements (
  tutor_id, student_id, lesson_id, occurred_at, kind,
  prepaid_delta, debt_delta, prepaid_after, debt_after
)
SELECT
  l.tutor_id,
  l.student_id,
  l.id,
  l.updated_at,
  'lesson_paid',
  0,
  -l.charge_debt_delta,
  0,
  0
FROM lessons l
WHERE l.balance_paid_applied = true
  AND l.charge_debt_delta > 0;
