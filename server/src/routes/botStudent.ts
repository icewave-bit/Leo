import { Router } from 'express';
import { z } from 'zod';
import { loadOpenLessonDebts } from '../billingDebt.js';
import { query } from '../db.js';
import { AppError } from '../errors.js';
import { runAutoCompleteForTutor } from '../lessonBalance.js';
import {
  toLesson,
  type LessonRow,
  type PersonalEventRow,
  type StudentRow,
} from '../mappers.js';
import { requireBotBearer, requireBotStudentAuth } from '../middleware/requireBotAuth.js';
import { computeOpenSlotsForWeek } from '../openSlots.js';
import { topUpRecurringPersonalSchedules } from '../personalRecurringSchedule.js';
import { topUpRecurringSchedules } from '../recurringSchedule.js';
import type { SlotOverrideRow } from '../scheduleBlocks.js';
import { zonedDayRangeUtc, zonedWeekRangeUtc } from '../scheduleSlots.js';
import { normalizeTelegramUsername } from '../telegramUsername.js';
import type { BalanceKind, WeekStartsOn } from '../types.js';
import { validate } from '../validate.js';

const registerSchema = z.object({
  telegramUserId: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).transform(String),
  telegramUsername: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .transform((v) => normalizeTelegramUsername(v))
    .refine((v): v is string => v != null && /^[A-Za-z0-9_]{5,32}$/i.test(v), {
      message: 'Invalid Telegram username',
    }),
});

const STUDENT_COLUMNS = `id, tutor_id, name, initials, hue, tz, meet_url, rate, currency, note,
  is_group, members, balance_kind, prepaid, debt, exclude_from_taxes, billing_student_id,
  telegram_user_id::text, telegram_username, archived_at, created_at`;

const LESSON_COLUMNS = `l.id, l.tutor_id, l.student_id, l.start_utc, l.duration_min, l.academic_units,
  l.status, l.type, l.paid, l.notes, l.balance_charged, l.balance_paid_applied,
  l.charge_prepaid_delta, l.charge_debt_delta, l.recurring_schedule_id, l.created_at, l.updated_at`;

const TUTOR_PREF_COLUMNS = `id, name, timezone, week_starts_on, hidden_weekdays,
  default_block_start_minutes, default_block_end_minutes`;

type TutorPrefsRow = {
  id: string;
  name: string;
  timezone: string;
  week_starts_on: WeekStartsOn;
  hidden_weekdays: number[];
  default_block_start_minutes: number;
  default_block_end_minutes: number;
};

async function loadTutorPrefs(tutorId: string): Promise<TutorPrefsRow> {
  const result = await query<TutorPrefsRow>(
    `SELECT ${TUTOR_PREF_COLUMNS} FROM tutors WHERE id = $1`,
    [tutorId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new AppError('UNAUTHORIZED', 401, 'Authentication required');
  }
  return row;
}

async function loadStudentRow(studentId: string, tutorId: string): Promise<StudentRow> {
  const result = await query<StudentRow>(
    `SELECT ${STUDENT_COLUMNS}
     FROM students WHERE id = $1 AND tutor_id = $2 AND archived_at IS NULL`,
    [studentId, tutorId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new AppError('TELEGRAM_NOT_LINKED', 403, 'Telegram account is not linked');
  }
  return row;
}

async function studentBalancePayload(student: StudentRow, tutorId: string) {
  const walletId = student.billing_student_id ?? student.id;
  let prepaid = Number(student.prepaid);
  let debt = Number(student.debt);
  let balanceKind = student.balance_kind as BalanceKind;
  let currency = student.currency;

  if (student.billing_student_id) {
    const payer = await query<{
      prepaid: string;
      debt: string;
      balance_kind: BalanceKind;
      currency: string;
    }>(
      `SELECT prepaid, debt, balance_kind, currency FROM students WHERE id = $1 AND tutor_id = $2`,
      [walletId, tutorId],
    );
    const payerRow = payer.rows[0];
    if (payerRow) {
      prepaid = Number(payerRow.prepaid);
      debt = Number(payerRow.debt);
      balanceKind = payerRow.balance_kind;
      currency = payerRow.currency;
    }
  }

  const openDebts = await loadOpenLessonDebts(tutorId, [student.id]);
  return {
    name: student.name,
    balanceKind,
    currency,
    prepaid,
    debt,
    openLessonDebt: openDebts.get(student.id) ?? 0,
    billingShared: student.billing_student_id != null,
  };
}

function studentMePayload(
  student: StudentRow,
  tutor: Pick<TutorPrefsRow, 'name' | 'timezone'>,
  balance: Awaited<ReturnType<typeof studentBalancePayload>>,
) {
  return {
    id: student.id,
    name: student.name,
    tutorName: tutor.name,
    timezone: tutor.timezone,
    telegramUsername: student.telegram_username,
    balance,
  };
}

export const botStudentRouter = Router();

botStudentRouter.post('/register', requireBotBearer, async (req, res, next) => {
  try {
    const body = validate(registerSchema, req.body);
    const username = body.telegramUsername;

    const tutorTaken = await query<{ id: string }>(
      'SELECT id FROM tutors WHERE telegram_user_id = $1',
      [body.telegramUserId],
    );
    if (tutorTaken.rows[0]) {
      throw new AppError(
        'CONFLICT',
        409,
        'Telegram account is already linked as a tutor',
      );
    }

    const byUsername = await query<StudentRow>(
      `SELECT ${STUDENT_COLUMNS}
       FROM students
       WHERE LOWER(telegram_username) = LOWER($1) AND archived_at IS NULL`,
      [username],
    );
    const student = byUsername.rows[0];
    if (!student) {
      throw new AppError('NOT_FOUND', 404, 'Student not found');
    }

    if (
      student.telegram_user_id != null &&
      student.telegram_user_id !== body.telegramUserId
    ) {
      throw new AppError(
        'CONFLICT',
        409,
        'This student is already linked to another Telegram account',
      );
    }

    const idTaken = await query<{ id: string }>(
      `SELECT id FROM students
       WHERE telegram_user_id = $1 AND id <> $2 AND archived_at IS NULL`,
      [body.telegramUserId, student.id],
    );
    if (idTaken.rows[0]) {
      throw new AppError(
        'CONFLICT',
        409,
        'Telegram account is already linked to another student',
      );
    }

    const updated = await query<StudentRow>(
      `UPDATE students
       SET telegram_user_id = $1, telegram_username = $2
       WHERE id = $3
       RETURNING ${STUDENT_COLUMNS}`,
      [body.telegramUserId, username, student.id],
    );
    const row = updated.rows[0]!;
    const tutor = await loadTutorPrefs(row.tutor_id);
    const balance = await studentBalancePayload(row, row.tutor_id);
    res.json({ student: studentMePayload(row, tutor, balance) });
  } catch (err) {
    next(err);
  }
});

botStudentRouter.use(requireBotStudentAuth);

botStudentRouter.get('/me', async (req, res, next) => {
  try {
    const student = await loadStudentRow(req.studentId!, req.tutorId!);
    const tutor = await loadTutorPrefs(req.tutorId!);
    const balance = await studentBalancePayload(student, req.tutorId!);
    res.json({ student: studentMePayload(student, tutor, balance) });
  } catch (err) {
    next(err);
  }
});

botStudentRouter.get('/balance', async (req, res, next) => {
  try {
    const student = await loadStudentRow(req.studentId!, req.tutorId!);
    const balance = await studentBalancePayload(student, req.tutorId!);
    res.json({ balance });
  } catch (err) {
    next(err);
  }
});

async function listStudentLessonsInRange(
  tutorId: string,
  studentId: string,
  from: Date,
  to: Date,
) {
  await runAutoCompleteForTutor(tutorId, { from, to });
  await topUpRecurringSchedules(tutorId);

  const result = await query<LessonRow>(
    `SELECT ${LESSON_COLUMNS}
     FROM lessons l
     WHERE l.tutor_id = $1
       AND l.student_id = $2
       AND l.start_utc >= $3 AND l.start_utc < $4
     ORDER BY l.start_utc`,
    [tutorId, studentId, from.toISOString(), to.toISOString()],
  );

  return result.rows.map(toLesson);
}

botStudentRouter.get('/week', async (req, res, next) => {
  try {
    const tutor = await loadTutorPrefs(req.tutorId!);
    const { from, to } = zonedWeekRangeUtc(new Date(), tutor.timezone, tutor.week_starts_on);
    const lessons = await listStudentLessonsInRange(req.tutorId!, req.studentId!, from, to);
    res.json({
      timezone: tutor.timezone,
      weekStartsOn: tutor.week_starts_on,
      from: from.toISOString(),
      to: to.toISOString(),
      lessons,
    });
  } catch (err) {
    next(err);
  }
});

botStudentRouter.get('/today', async (req, res, next) => {
  try {
    const tutor = await loadTutorPrefs(req.tutorId!);
    const { from, to } = zonedDayRangeUtc(new Date(), tutor.timezone);
    const lessons = await listStudentLessonsInRange(req.tutorId!, req.studentId!, from, to);
    res.json({
      timezone: tutor.timezone,
      from: from.toISOString(),
      to: to.toISOString(),
      lessons,
    });
  } catch (err) {
    next(err);
  }
});

botStudentRouter.get('/open-slots', async (req, res, next) => {
  try {
    const tutor = await loadTutorPrefs(req.tutorId!);
    const { from, to } = zonedWeekRangeUtc(new Date(), tutor.timezone, tutor.week_starts_on);

    await topUpRecurringSchedules(req.tutorId!);
    await topUpRecurringPersonalSchedules(req.tutorId!);

    const [lessons, personal, overrides] = await Promise.all([
      query<{ start_utc: Date; duration_min: number }>(
        `SELECT start_utc, duration_min FROM lessons
         WHERE tutor_id = $1 AND start_utc >= $2 AND start_utc < $3
           AND status <> 'cancelled'`,
        [req.tutorId, from.toISOString(), to.toISOString()],
      ),
      query<Pick<PersonalEventRow, 'start_utc' | 'duration_min'>>(
        `SELECT start_utc, duration_min FROM personal_events
         WHERE tutor_id = $1 AND start_utc >= $2 AND start_utc < $3`,
        [req.tutorId, from.toISOString(), to.toISOString()],
      ),
      query<SlotOverrideRow>(
        `SELECT weekday, start_minutes, blocked
         FROM schedule_slot_overrides WHERE tutor_id = $1`,
        [req.tutorId],
      ),
    ]);

    const occupied = [
      ...lessons.rows.map((r) => ({ startUtc: r.start_utc, durationMin: r.duration_min })),
      ...personal.rows.map((r) => ({ startUtc: r.start_utc, durationMin: r.duration_min })),
    ];

    const days = computeOpenSlotsForWeek({
      timezone: tutor.timezone,
      weekStartsOn: tutor.week_starts_on,
      hiddenWeekdays: tutor.hidden_weekdays ?? [],
      blockWindow: {
        startMinutes: tutor.default_block_start_minutes,
        endMinutes: tutor.default_block_end_minutes,
      },
      overrides: overrides.rows,
      occupied,
    });

    res.json({
      timezone: tutor.timezone,
      weekStartsOn: tutor.week_starts_on,
      from: from.toISOString(),
      to: to.toISOString(),
      days,
    });
  } catch (err) {
    next(err);
  }
});
