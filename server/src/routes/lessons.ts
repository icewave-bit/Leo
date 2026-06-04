import { Router } from 'express';
import { z } from 'zod';
import {
  durationMinFromUnits,
  getTutorAcademicHourMin,
  inferAcademicUnits,
} from '../academicHour.js';
import { getPool, query } from '../db.js';
import { AppError } from '../errors.js';
import {
  reverseLessonBalanceCharge,
  runAutoCompleteForTutor,
  syncLessonBalanceForPaid,
  syncLessonBalanceForStatus,
} from '../lessonBalance.js';
import { toLesson, type LessonRow } from '../mappers.js';
import type { AcademicUnits } from '../types.js';
import { validate } from '../validate.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { skipRecurringOccurrence, topUpRecurringSchedules } from '../recurringSchedule.js';
import { assertActiveStudentOwned, assertStudentOwned } from '../studentAccess.js';

const lessonStatusEnum = z.enum(['planned', 'completed', 'cancelled', 'no_show']);
const lessonTypeEnum = z.enum(['solo', 'group']);
const academicUnitsSchema = z.union([z.literal(1), z.literal(2)]);

const listLessonsQuerySchema = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  studentId: z.string().uuid().optional(),
});

const createLessonSchema = z
  .object({
    studentId: z.string().uuid(),
    startUtc: z.string().datetime({ offset: true }),
    academicUnits: academicUnitsSchema.optional(),
    durationMin: z.number().int().positive().optional(),
    type: lessonTypeEnum.default('solo'),
    notes: z.string().nullable().optional(),
  })
  .refine((data) => data.academicUnits != null || data.durationMin != null, {
    message: 'academicUnits or durationMin is required',
  });

const patchLessonSchema = z
  .object({
    status: lessonStatusEnum.optional(),
    paid: z.boolean().optional(),
    startUtc: z.string().datetime({ offset: true }).optional(),
    academicUnits: academicUnitsSchema.optional(),
    durationMin: z.number().int().positive().optional(),
    notes: z.string().nullable().optional(),
    studentId: z.string().uuid().optional(),
    restoreBalance: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

const deleteLessonQuerySchema = z.object({
  restoreBalance: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

const LESSON_COLUMNS = `id, tutor_id, student_id, start_utc, duration_min, academic_units, status, type, paid, notes,
              balance_charged, balance_paid_applied, charge_prepaid_delta, charge_debt_delta,
              recurring_schedule_id, created_at, updated_at`;

export const lessonsRouter = Router();

lessonsRouter.use(requireAuth);

async function resolveLessonTiming(
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

lessonsRouter.get('/', async (req, res, next) => {
  try {
    const q = validate(listLessonsQuerySchema, req.query);
    const from = new Date(q.from);
    const to = new Date(q.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      throw new AppError('VALIDATION', 400, 'Invalid date range', {
        from: 'must be before to',
      });
    }

    await runAutoCompleteForTutor(req.tutorId!, { from, to });
    await topUpRecurringSchedules(req.tutorId!);

    const params: unknown[] = [req.tutorId, from.toISOString(), to.toISOString()];
    let studentFilter = '';
    if (q.studentId) {
      await assertStudentOwned(req.tutorId!, q.studentId);
      studentFilter = ` AND student_id = $4`;
      params.push(q.studentId);
    } else {
      studentFilter = ` AND EXISTS (
        SELECT 1 FROM students s
        WHERE s.id = lessons.student_id AND s.archived_at IS NULL
      )`;
    }

    const result = await query<LessonRow>(
      `SELECT ${LESSON_COLUMNS}
       FROM lessons
       WHERE tutor_id = $1 AND start_utc >= $2 AND start_utc < $3${studentFilter}
       ORDER BY start_utc`,
      params,
    );
    res.json(result.rows.map(toLesson));
  } catch (err) {
    next(err);
  }
});

lessonsRouter.post('/', async (req, res, next) => {
  try {
    const body = validate(createLessonSchema, req.body);
    await assertActiveStudentOwned(req.tutorId!, body.studentId);
    const startUtc = new Date(body.startUtc);
    const timing = await resolveLessonTiming(req.tutorId!, body);

    const inserted = await query<LessonRow>(
      `INSERT INTO lessons (tutor_id, student_id, start_utc, duration_min, academic_units, status, type, paid, notes)
       VALUES ($1, $2, $3, $4, $5, 'planned', $6, false, $7)
       RETURNING ${LESSON_COLUMNS}`,
      [
        req.tutorId,
        body.studentId,
        startUtc.toISOString(),
        timing.durationMin,
        timing.academicUnits,
        body.type,
        body.notes ?? null,
      ],
    );
    res.status(201).json(toLesson(inserted.rows[0]!));
  } catch (err) {
    next(err);
  }
});

lessonsRouter.patch('/:id', async (req, res, next) => {
  const client = await getPool().connect();
  try {
    const body = validate(patchLessonSchema, req.body);
    if (body.studentId) {
      await assertActiveStudentOwned(req.tutorId!, body.studentId);
    }

    await client.query('BEGIN');

    const existing = await client.query<LessonRow>(
      `SELECT ${LESSON_COLUMNS}
       FROM lessons WHERE id = $1 AND tutor_id = $2 FOR UPDATE`,
      [req.params.id, req.tutorId],
    );
    const row = existing.rows[0];
    if (!row) {
      throw new AppError('NOT_FOUND', 404, 'Lesson not found');
    }
    const previousStatus = row.status;

    if (body.restoreBalance === true && row.balance_charged) {
      await reverseLessonBalanceCharge(client, row);
    }

    if (body.startUtc !== undefined && row.recurring_schedule_id) {
      const newStart = new Date(body.startUtc).toISOString();
      const oldStart = row.start_utc.toISOString();
      if (newStart !== oldStart) {
        await skipRecurringOccurrence(client, row.recurring_schedule_id, row.start_utc);
      }
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (body.academicUnits != null) {
      const academicHourMin = await getTutorAcademicHourMin(req.tutorId!);
      fields.push(`academic_units = $${idx++}`);
      values.push(body.academicUnits);
      fields.push(`duration_min = $${idx++}`);
      values.push(durationMinFromUnits(body.academicUnits, academicHourMin));
    } else if (body.durationMin !== undefined) {
      const academicHourMin = await getTutorAcademicHourMin(req.tutorId!);
      fields.push(`duration_min = $${idx++}`);
      values.push(body.durationMin);
      fields.push(`academic_units = $${idx++}`);
      values.push(inferAcademicUnits(body.durationMin, academicHourMin));
    }

    if (body.status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(body.status);
    }
    if (body.paid !== undefined) {
      fields.push(`paid = $${idx++}`);
      values.push(body.paid);
    }
    if (body.startUtc !== undefined) {
      fields.push(`start_utc = $${idx++}`);
      values.push(new Date(body.startUtc).toISOString());
    }
    if (body.notes !== undefined) {
      fields.push(`notes = $${idx++}`);
      values.push(body.notes);
    }
    if (body.studentId !== undefined) {
      fields.push(`student_id = $${idx++}`);
      values.push(body.studentId);
    }

    if (fields.length > 0) {
      fields.push(`updated_at = now()`);
      values.push(req.params.id, req.tutorId);
      const idParam = idx++;
      const tutorParam = idx;

      await client.query(
        `UPDATE lessons SET ${fields.join(', ')}
         WHERE id = $${idParam} AND tutor_id = $${tutorParam}`,
        values,
      );
    }

    const current = await client.query<LessonRow>(
      `SELECT ${LESSON_COLUMNS} FROM lessons WHERE id = $1 FOR UPDATE`,
      [req.params.id],
    );
    let updated = current.rows[0]!;

    if (body.status !== undefined) {
      const paidAfterUpdate = body.paid !== undefined ? body.paid : updated.paid;
      await syncLessonBalanceForStatus(
        client,
        updated,
        previousStatus,
        body.status,
        paidAfterUpdate,
      );
      const refreshed = await client.query<LessonRow>(
        `SELECT ${LESSON_COLUMNS} FROM lessons WHERE id = $1`,
        [updated.id],
      );
      updated = refreshed.rows[0]!;
    }

    if (body.paid !== undefined) {
      await syncLessonBalanceForPaid(client, updated, body.paid);
      const refreshed = await client.query<LessonRow>(
        `SELECT ${LESSON_COLUMNS} FROM lessons WHERE id = $1`,
        [updated.id],
      );
      updated = refreshed.rows[0]!;
    }

    await client.query('COMMIT');
    res.json(toLesson(updated));
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

lessonsRouter.delete('/:id', async (req, res, next) => {
  const client = await getPool().connect();
  try {
    const q = validate(deleteLessonQuerySchema, req.query);

    await client.query('BEGIN');

    const existing = await client.query<LessonRow>(
      `SELECT ${LESSON_COLUMNS}
       FROM lessons WHERE id = $1 AND tutor_id = $2 FOR UPDATE`,
      [req.params.id, req.tutorId],
    );
    const row = existing.rows[0];
    if (!row) {
      throw new AppError('NOT_FOUND', 404, 'Lesson not found');
    }

    if (q.restoreBalance && row.balance_charged) {
      await reverseLessonBalanceCharge(client, row);
    }

    if (row.recurring_schedule_id) {
      await skipRecurringOccurrence(client, row.recurring_schedule_id, row.start_utc);
    }

    await client.query('DELETE FROM lessons WHERE id = $1 AND tutor_id = $2', [
      req.params.id,
      req.tutorId,
    ]);

    await client.query('COMMIT');
    res.status(204).send();
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});
