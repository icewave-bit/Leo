import { Router } from 'express';
import { z } from 'zod';
import { getPool, query } from '../db.js';
import { AppError } from '../errors.js';
import { toRecurringPersonalSchedule, type RecurringPersonalScheduleRow } from '../mappers.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { assertPersonalEventGroupOwned } from '../personalEventGroups.js';
import {
  deleteFuturePersonalEventsForSchedule,
  deletePersonalEventsFromScheduleAnchor,
  materializeRecurringPersonalSchedule,
  topUpRecurringPersonalSchedules,
} from '../personalRecurringSchedule.js';
import {
  getTutorSchedulePrefs,
  horizonEndDateFromNow,
  resolveMaterializeHorizon,
} from '../recurringSchedule.js';
import { validate } from '../validate.js';

const weekdaysSchema = z
  .array(z.number().int().min(0).max(6))
  .min(1)
  .transform((days) => [...new Set(days)].sort((a, b) => a - b));

const createSchema = z
  .object({
    groupId: z.string().uuid(),
    title: z.string().trim().min(1).max(80),
    weekdays: weekdaysSchema,
    startMinutes: z.number().int().min(0).max(1439),
    durationMin: z.number().int().min(15).max(480),
    notes: z.string().nullable().optional(),
    intervalWeeks: z.number().int().min(1).default(1),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  })
  .refine((data) => !data.endDate || data.endDate >= data.startDate, {
    message: 'endDate must be on or after startDate',
  });

const patchSchema = z
  .object({
    active: z.boolean().optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    notes: z.string().nullable().optional(),
    title: z.string().trim().min(1).max(80).optional(),
    groupId: z.string().uuid().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

const deleteQuerySchema = z.object({
  fromEventId: z.string().uuid(),
});

const COLUMNS = `id, tutor_id, group_id, title, weekdays, start_minutes, duration_min,
  notes, interval_weeks, start_date::text AS start_date, end_date::text AS end_date, active, created_at, updated_at`;

export const recurringPersonalSchedulesRouter = Router();

recurringPersonalSchedulesRouter.use(requireAuth);

async function fetchOwned(
  tutorId: string,
  id: string,
): Promise<RecurringPersonalScheduleRow> {
  const result = await query<RecurringPersonalScheduleRow>(
    `SELECT ${COLUMNS} FROM recurring_personal_schedules WHERE id = $1 AND tutor_id = $2`,
    [id, tutorId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new AppError('NOT_FOUND', 404, 'Recurring personal schedule not found');
  }
  return row;
}

recurringPersonalSchedulesRouter.get('/', async (req, res, next) => {
  try {
    const result = await query<RecurringPersonalScheduleRow>(
      `SELECT ${COLUMNS}
       FROM recurring_personal_schedules
       WHERE tutor_id = $1
       ORDER BY active DESC, start_date, start_minutes`,
      [req.tutorId],
    );
    res.json(result.rows.map(toRecurringPersonalSchedule));
  } catch (err) {
    next(err);
  }
});

recurringPersonalSchedulesRouter.post('/', async (req, res, next) => {
  const client = await getPool().connect();
  try {
    const body = validate(createSchema, req.body);
    await assertPersonalEventGroupOwned(req.tutorId!, body.groupId);
    const prefs = await getTutorSchedulePrefs(req.tutorId!);
    const endDate = body.endDate ?? null;

    await client.query('BEGIN');

    const inserted = await client.query<RecurringPersonalScheduleRow>(
      `INSERT INTO recurring_personal_schedules (
         tutor_id, group_id, title, weekdays, start_minutes, duration_min,
         notes, interval_weeks, start_date, end_date
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING ${COLUMNS}`,
      [
        req.tutorId,
        body.groupId,
        body.title,
        body.weekdays,
        body.startMinutes,
        body.durationMin,
        body.notes ?? null,
        body.intervalWeeks,
        body.startDate,
        endDate,
      ],
    );

    const schedule = inserted.rows[0]!;
    const rollingHorizon = horizonEndDateFromNow(prefs.timezone);
    const horizonEndDate = resolveMaterializeHorizon(schedule, rollingHorizon);
    await materializeRecurringPersonalSchedule(client, schedule, prefs, horizonEndDate);

    await client.query('COMMIT');
    res.status(201).json(toRecurringPersonalSchedule(schedule));
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

recurringPersonalSchedulesRouter.patch('/:id', async (req, res, next) => {
  const client = await getPool().connect();
  try {
    const body = validate(patchSchema, req.body);
    if (body.groupId) {
      await assertPersonalEventGroupOwned(req.tutorId!, body.groupId);
    }

    await client.query('BEGIN');
    const existing = await fetchOwned(req.tutorId!, req.params.id);

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
    if (body.title !== undefined) {
      fields.push(`title = $${idx++}`);
      values.push(body.title);
    }
    if (body.groupId !== undefined) {
      fields.push(`group_id = $${idx++}`);
      values.push(body.groupId);
    }

    if (fields.length > 0) {
      fields.push('updated_at = now()');
      values.push(req.params.id, req.tutorId);
      await client.query(
        `UPDATE recurring_personal_schedules SET ${fields.join(', ')}
         WHERE id = $${idx++} AND tutor_id = $${idx}`,
        values,
      );
    }

    const updated = await fetchOwned(req.tutorId!, req.params.id);

    if (body.active === true || body.endDate !== undefined) {
      const prefs = await getTutorSchedulePrefs(req.tutorId!);
      const rollingHorizon = horizonEndDateFromNow(prefs.timezone);
      const horizonEndDate = resolveMaterializeHorizon(updated, rollingHorizon);
      await materializeRecurringPersonalSchedule(client, updated, prefs, horizonEndDate);
    }

    if (body.active === false) {
      await deleteFuturePersonalEventsForSchedule(client, existing.id, req.tutorId!);
    }

    await client.query('COMMIT');
    res.json(toRecurringPersonalSchedule(updated));
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

recurringPersonalSchedulesRouter.delete('/:id', async (req, res, next) => {
  const client = await getPool().connect();
  try {
    const q = validate(deleteQuerySchema, req.query);
    await client.query('BEGIN');
    await fetchOwned(req.tutorId!, req.params.id);

    const anchorEvent = await client.query<{
      start_utc: Date;
      recurring_personal_schedule_id: string | null;
    }>(
      `SELECT start_utc, recurring_personal_schedule_id
       FROM personal_events
       WHERE id = $1 AND tutor_id = $2`,
      [q.fromEventId, req.tutorId],
    );
    const anchor = anchorEvent.rows[0];
    if (!anchor) {
      throw new AppError('NOT_FOUND', 404, 'Personal event not found');
    }
    if (anchor.recurring_personal_schedule_id !== req.params.id) {
      throw new AppError('VALIDATION', 400, 'Event does not belong to this series', {
        fromEventId: 'invalid',
      });
    }

    await deletePersonalEventsFromScheduleAnchor(
      client,
      req.params.id,
      req.tutorId!,
      anchor.start_utc,
    );

    await client.query(
      'DELETE FROM recurring_personal_schedules WHERE id = $1 AND tutor_id = $2',
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

recurringPersonalSchedulesRouter.post('/sync', async (req, res, next) => {
  try {
    await topUpRecurringPersonalSchedules(req.tutorId!);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
