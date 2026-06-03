import { Router } from 'express';
import { z } from 'zod';
import {
  durationMinFromUnits,
  getTutorAcademicHourMin,
  inferAcademicUnits,
} from '../academicHour.js';
import { getPool, query } from '../db.js';
import { AppError } from '../errors.js';
import { toRecurringSchedule, type RecurringScheduleRow } from '../mappers.js';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  getTutorSchedulePrefs,
  horizonEndDateFromNow,
  deleteFutureLessonsForSchedule,
  deleteLessonsFromScheduleAnchor,
  materializeRecurringSchedule,
  topUpRecurringSchedules,
  resolveMaterializeHorizon,
} from '../recurringSchedule.js';
import type { AcademicUnits } from '../types.js';
import { validate } from '../validate.js';

const lessonTypeEnum = z.enum(['solo', 'group']);
const academicUnitsSchema = z.union([z.literal(1), z.literal(2)]);
const weekdaysSchema = z
  .array(z.number().int().min(0).max(6))
  .min(1)
  .transform((days) => [...new Set(days)].sort((a, b) => a - b));

const createRecurringScheduleSchema = z
  .object({
    studentId: z.string().uuid(),
    weekdays: weekdaysSchema,
    startMinutes: z.number().int().min(0).max(1439),
    academicUnits: academicUnitsSchema.optional(),
    durationMin: z.number().int().positive().optional(),
    type: lessonTypeEnum.default('solo'),
    notes: z.string().nullable().optional(),
    intervalWeeks: z.number().int().min(1).default(1),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  })
  .refine((data) => data.academicUnits != null || data.durationMin != null, {
    message: 'academicUnits or durationMin is required',
  })
  .refine(
    (data) => !data.endDate || data.endDate >= data.startDate,
    { message: 'endDate must be on or after startDate' },
  );

const patchRecurringScheduleSchema = z
  .object({
    active: z.boolean().optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

const deleteRecurringQuerySchema = z.object({
  fromLessonId: z.string().uuid(),
});

const RECURRING_COLUMNS = `id, tutor_id, student_id, weekdays, start_minutes, duration_min, academic_units,
  type, notes, interval_weeks, start_date::text AS start_date, end_date::text AS end_date, active, created_at, updated_at`;

export const recurringSchedulesRouter = Router();

recurringSchedulesRouter.use(requireAuth);

async function assertStudentOwned(tutorId: string, studentId: string): Promise<void> {
  const result = await query<{ id: string }>(
    'SELECT id FROM students WHERE id = $1 AND tutor_id = $2',
    [studentId, tutorId],
  );
  if (result.rows.length === 0) {
    throw new AppError('VALIDATION', 400, 'Student not found', { studentId: 'invalid' });
  }
}

async function resolveTiming(
  tutorId: string,
  input: { academicUnits?: AcademicUnits; durationMin?: number },
): Promise<{ academicUnits: AcademicUnits; durationMin: number }> {
  const academicHourMin = await getTutorAcademicHourMin(tutorId);
  if (input.academicUnits != null) {
    return {
      academicUnits: input.academicUnits,
      durationMin: durationMinFromUnits(input.academicUnits, academicHourMin),
    };
  }
  const durationMin = input.durationMin!;
  return {
    durationMin,
    academicUnits: inferAcademicUnits(durationMin, academicHourMin),
  };
}

async function fetchOwnedSchedule(
  tutorId: string,
  id: string,
): Promise<RecurringScheduleRow> {
  const result = await query<RecurringScheduleRow>(
    `SELECT ${RECURRING_COLUMNS}
     FROM recurring_schedules
     WHERE id = $1 AND tutor_id = $2`,
    [id, tutorId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new AppError('NOT_FOUND', 404, 'Recurring schedule not found');
  }
  return row;
}

recurringSchedulesRouter.get('/', async (req, res, next) => {
  try {
    const result = await query<RecurringScheduleRow>(
      `SELECT ${RECURRING_COLUMNS}
       FROM recurring_schedules
       WHERE tutor_id = $1
       ORDER BY active DESC, start_date, start_minutes`,
      [req.tutorId],
    );
    res.json(result.rows.map(toRecurringSchedule));
  } catch (err) {
    next(err);
  }
});

recurringSchedulesRouter.post('/', async (req, res, next) => {
  const client = await getPool().connect();
  try {
    const body = validate(createRecurringScheduleSchema, req.body);
    await assertStudentOwned(req.tutorId!, body.studentId);
    const timing = await resolveTiming(req.tutorId!, body);
    const prefs = await getTutorSchedulePrefs(req.tutorId!);
    const endDate = body.endDate ?? null;

    await client.query('BEGIN');

    const inserted = await client.query<RecurringScheduleRow>(
      `INSERT INTO recurring_schedules (
         tutor_id, student_id, weekdays, start_minutes, duration_min, academic_units,
         type, notes, interval_weeks, start_date, end_date
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, tutor_id, student_id, weekdays, start_minutes, duration_min, academic_units,
                 type, notes, interval_weeks, start_date::text AS start_date, end_date::text AS end_date,
                 active, created_at, updated_at`,
      [
        req.tutorId,
        body.studentId,
        body.weekdays,
        body.startMinutes,
        timing.durationMin,
        timing.academicUnits,
        body.type,
        body.notes ?? null,
        body.intervalWeeks,
        body.startDate,
        endDate,
      ],
    );

    const schedule = inserted.rows[0]!;
    const rollingHorizon = horizonEndDateFromNow(prefs.timezone);
    const horizonEndDate = resolveMaterializeHorizon(schedule, rollingHorizon);
    await materializeRecurringSchedule(client, schedule, prefs, horizonEndDate);

    await client.query('COMMIT');
    res.status(201).json(toRecurringSchedule(schedule));
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

recurringSchedulesRouter.patch('/:id', async (req, res, next) => {
  const client = await getPool().connect();
  try {
    const body = validate(patchRecurringScheduleSchema, req.body);
    await client.query('BEGIN');
    const existing = await fetchOwnedSchedule(req.tutorId!, req.params.id);

    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (body.active !== undefined) {
      fields.push(`active = $${idx++}`);
      values.push(body.active);
    }
    if (body.endDate !== undefined) {
      fields.push(`end_date = $${idx++}`);
      values.push(body.endDate);
    }
    if (body.notes !== undefined) {
      fields.push(`notes = $${idx++}`);
      values.push(body.notes);
    }

    if (fields.length > 0) {
      fields.push('updated_at = now()');
      values.push(req.params.id, req.tutorId);
      await client.query(
        `UPDATE recurring_schedules SET ${fields.join(', ')}
         WHERE id = $${idx++} AND tutor_id = $${idx}`,
        values,
      );
    }

    const updated = await fetchOwnedSchedule(req.tutorId!, req.params.id);

    if (body.active === true || body.endDate !== undefined) {
      const prefs = await getTutorSchedulePrefs(req.tutorId!);
      const rollingHorizon = horizonEndDateFromNow(prefs.timezone);
      const horizonEndDate = resolveMaterializeHorizon(updated, rollingHorizon);
      await materializeRecurringSchedule(client, updated, prefs, horizonEndDate);
    }

    if (body.active === false) {
      await deleteFutureLessonsForSchedule(client, existing.id, req.tutorId!);
    }

    await client.query('COMMIT');
    res.json(toRecurringSchedule(updated));
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

recurringSchedulesRouter.delete('/:id', async (req, res, next) => {
  const client = await getPool().connect();
  try {
    const q = validate(deleteRecurringQuerySchema, req.query);
    await client.query('BEGIN');
    await fetchOwnedSchedule(req.tutorId!, req.params.id);

    const anchorLesson = await client.query<{ start_utc: Date; recurring_schedule_id: string | null }>(
      `SELECT start_utc, recurring_schedule_id
       FROM lessons
       WHERE id = $1 AND tutor_id = $2`,
      [q.fromLessonId, req.tutorId],
    );
    const anchor = anchorLesson.rows[0];
    if (!anchor) {
      throw new AppError('NOT_FOUND', 404, 'Lesson not found');
    }
    if (anchor.recurring_schedule_id !== req.params.id) {
      throw new AppError('VALIDATION', 400, 'Lesson does not belong to this series', {
        fromLessonId: 'invalid',
      });
    }

    await deleteLessonsFromScheduleAnchor(
      client,
      req.params.id,
      req.tutorId!,
      anchor.start_utc,
    );

    await client.query(
      'DELETE FROM recurring_schedules WHERE id = $1 AND tutor_id = $2',
      [req.params.id, req.tutorId],
    );

    await client.query('COMMIT');
    res.status(204).send();
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

recurringSchedulesRouter.post('/sync', async (req, res, next) => {
  try {
    await topUpRecurringSchedules(req.tutorId!);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
