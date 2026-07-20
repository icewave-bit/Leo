import { Router } from 'express';
import { z } from 'zod';
import { loadOpenLessonDebts } from '../billingDebt.js';
import { query } from '../db.js';
import { AppError } from '../errors.js';
import { runAutoCompleteForTutor } from '../lessonBalance.js';
import { toBotPersonalEvent, toLesson, toStudent, toTutor, type LessonRow, type PersonalEventRow, type StudentRow, type TutorRow } from '../mappers.js';
import { requireBotAuth, requireBotBearer } from '../middleware/requireBotAuth.js';
import { topUpRecurringPersonalSchedules } from '../personalRecurringSchedule.js';
import { topUpRecurringSchedules } from '../recurringSchedule.js';
import { zonedDayRangeUtc, zonedWeekRangeUtc } from '../scheduleSlots.js';
import type { WeekStartsOn } from '../types.js';
import { validate } from '../validate.js';

const linkSchema = z.object({
  code: z
    .string()
    .trim()
    .min(4)
    .max(16)
    .transform((c) => c.toUpperCase()),
  telegramUserId: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).transform(String),
  telegramUsername: z.string().trim().min(1).max(64).nullable().optional(),
});

const TUTOR_COLUMNS = `id, email, name, initials, subject, timezone, academic_hour_min, week_starts_on,
  default_replenish_balance_kind, tax_rate_percent, tax_display_currency, hidden_weekdays,
  default_block_start_minutes, default_block_end_minutes, personal_event_outline,
  telegram_user_id::text, telegram_username,
  telegram_notify_enabled, telegram_notify_lead_minutes, telegram_notify_silent,
  telegram_notify_lessons, telegram_notify_personal, telegram_notify_personal_group_ids, created_at`;

const LESSON_COLUMNS = `l.id, l.tutor_id, l.student_id, l.start_utc, l.duration_min, l.academic_units,
  l.status, l.type, l.paid, l.notes, l.balance_charged, l.balance_paid_applied,
  l.charge_prepaid_delta, l.charge_debt_delta, l.recurring_schedule_id, l.created_at, l.updated_at`;

const STUDENT_COLUMNS = `id, tutor_id, name, initials, hue, tz, meet_url, rate, currency, note,
  is_group, members, balance_kind, prepaid, debt, exclude_from_taxes, billing_student_id,
  archived_at, created_at`;

export const botRouter = Router();

botRouter.post('/link', requireBotBearer, async (req, res, next) => {
  try {
    const body = validate(linkSchema, req.body);

    const codeRow = await query<{ tutor_id: string; expires_at: Date }>(
      `SELECT tutor_id, expires_at FROM telegram_link_codes WHERE code = $1`,
      [body.code],
    );
    const link = codeRow.rows[0];
    if (!link) {
      throw new AppError('NOT_FOUND', 404, 'Link code not found');
    }
    if (link.expires_at.getTime() <= Date.now()) {
      await query('DELETE FROM telegram_link_codes WHERE code = $1', [body.code]);
      throw new AppError('VALIDATION', 400, 'Link code has expired');
    }

    const taken = await query<{ id: string }>(
      `SELECT id FROM tutors WHERE telegram_user_id = $1 AND id <> $2`,
      [body.telegramUserId, link.tutor_id],
    );
    if (taken.rows[0]) {
      throw new AppError('CONFLICT', 409, 'Telegram account is already linked to another tutor');
    }

    const username = body.telegramUsername === undefined ? null : body.telegramUsername;

    const updated = await query<TutorRow>(
      `UPDATE tutors
       SET telegram_user_id = $1, telegram_username = $2
       WHERE id = $3
       RETURNING ${TUTOR_COLUMNS}`,
      [body.telegramUserId, username, link.tutor_id],
    );
    const tutor = updated.rows[0];
    if (!tutor) {
      throw new AppError('NOT_FOUND', 404, 'Tutor not found');
    }

    await query('DELETE FROM telegram_link_codes WHERE tutor_id = $1', [link.tutor_id]);

    res.json({ tutor: toTutor(tutor) });
  } catch (err) {
    next(err);
  }
});

botRouter.use(requireBotAuth);

botRouter.get('/me', async (req, res, next) => {
  try {
    const result = await query<TutorRow>(
      `SELECT ${TUTOR_COLUMNS} FROM tutors WHERE id = $1`,
      [req.tutorId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new AppError('UNAUTHORIZED', 401, 'Authentication required');
    }
    res.json({ tutor: toTutor(row) });
  } catch (err) {
    next(err);
  }
});

async function loadTutorPrefs(tutorId: string): Promise<{ timezone: string; weekStartsOn: WeekStartsOn }> {
  const result = await query<{ timezone: string; week_starts_on: WeekStartsOn }>(
    'SELECT timezone, week_starts_on FROM tutors WHERE id = $1',
    [tutorId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new AppError('UNAUTHORIZED', 401, 'Authentication required');
  }
  return { timezone: row.timezone, weekStartsOn: row.week_starts_on };
}

async function listLessonsInRange(tutorId: string, from: Date, to: Date) {
  await runAutoCompleteForTutor(tutorId, { from, to });
  await topUpRecurringSchedules(tutorId);

  const result = await query<LessonRow & { student_name: string }>(
    `SELECT ${LESSON_COLUMNS}, s.name AS student_name
     FROM lessons l
     JOIN students s ON s.id = l.student_id
     WHERE l.tutor_id = $1
       AND l.start_utc >= $2 AND l.start_utc < $3
       AND s.archived_at IS NULL
     ORDER BY l.start_utc`,
    [tutorId, from.toISOString(), to.toISOString()],
  );

  return result.rows.map((row) => ({
    ...toLesson(row),
    studentName: row.student_name,
  }));
}

botRouter.get('/today', async (req, res, next) => {
  try {
    const prefs = await loadTutorPrefs(req.tutorId!);
    const { from, to } = zonedDayRangeUtc(new Date(), prefs.timezone);
    const lessons = await listLessonsInRange(req.tutorId!, from, to);
    res.json({
      timezone: prefs.timezone,
      from: from.toISOString(),
      to: to.toISOString(),
      lessons,
    });
  } catch (err) {
    next(err);
  }
});

botRouter.get('/personal-events/today', async (req, res, next) => {
  try {
    const prefs = await loadTutorPrefs(req.tutorId!);
    const { from, to } = zonedDayRangeUtc(new Date(), prefs.timezone);

    await topUpRecurringPersonalSchedules(req.tutorId!);

    const result = await query<PersonalEventRow & { group_name: string }>(
      `SELECT pe.id, pe.tutor_id, pe.group_id, pe.title, pe.start_utc, pe.duration_min, pe.notes,
              pe.recurring_personal_schedule_id, pe.created_at, pe.updated_at,
              peg.name AS group_name
       FROM personal_events pe
       JOIN personal_event_groups peg ON peg.id = pe.group_id
       WHERE pe.tutor_id = $1
         AND pe.start_utc >= $2 AND pe.start_utc < $3
       ORDER BY pe.start_utc`,
      [req.tutorId, from.toISOString(), to.toISOString()],
    );

    res.json({
      timezone: prefs.timezone,
      from: from.toISOString(),
      to: to.toISOString(),
      events: result.rows.map(toBotPersonalEvent),
    });
  } catch (err) {
    next(err);
  }
});

botRouter.get('/week', async (req, res, next) => {
  try {
    const prefs = await loadTutorPrefs(req.tutorId!);
    const { from, to } = zonedWeekRangeUtc(new Date(), prefs.timezone, prefs.weekStartsOn);
    const lessons = await listLessonsInRange(req.tutorId!, from, to);
    res.json({
      timezone: prefs.timezone,
      weekStartsOn: prefs.weekStartsOn,
      from: from.toISOString(),
      to: to.toISOString(),
      lessons,
    });
  } catch (err) {
    next(err);
  }
});

botRouter.get('/students', async (req, res, next) => {
  try {
    const result = await query<StudentRow>(
      `SELECT ${STUDENT_COLUMNS}
       FROM students WHERE tutor_id = $1 AND archived_at IS NULL ORDER BY name`,
      [req.tutorId],
    );
    const openDebts = await loadOpenLessonDebts(
      req.tutorId!,
      result.rows.map((r) => r.id),
    );
    res.json({
      students: result.rows.map((row) => toStudent(row, openDebts.get(row.id) ?? 0)),
    });
  } catch (err) {
    next(err);
  }
});

botRouter.get('/debt', async (req, res, next) => {
  try {
    const result = await query<StudentRow>(
      `SELECT ${STUDENT_COLUMNS}
       FROM students WHERE tutor_id = $1 AND archived_at IS NULL ORDER BY name`,
      [req.tutorId],
    );
    const openDebts = await loadOpenLessonDebts(
      req.tutorId!,
      result.rows.map((r) => r.id),
    );
    const students = result.rows
      .map((row) => toStudent(row, openDebts.get(row.id) ?? 0))
      .filter((s) => s.debt > 0 || s.openLessonDebt > 0);
    res.json({ students });
  } catch (err) {
    next(err);
  }
});
