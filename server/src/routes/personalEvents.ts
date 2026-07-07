import { Router } from 'express';
import { z } from 'zod';
import { getPool, query } from '../db.js';
import { AppError } from '../errors.js';
import { toPersonalEvent, type PersonalEventRow } from '../mappers.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { assertPersonalEventGroupOwned } from '../personalEventGroups.js';
import { skipRecurringPersonalOccurrence, topUpRecurringPersonalSchedules } from '../personalRecurringSchedule.js';
import { validate } from '../validate.js';

const durationMinSchema = z.number().int().min(15).max(480);

const listQuerySchema = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
});

const createPersonalEventSchema = z.object({
  groupId: z.string().uuid(),
  title: z.string().trim().min(1).max(80),
  startUtc: z.string().datetime({ offset: true }),
  durationMin: durationMinSchema,
  notes: z.string().nullable().optional(),
});

const patchPersonalEventSchema = z
  .object({
    groupId: z.string().uuid().optional(),
    title: z.string().trim().min(1).max(80).optional(),
    startUtc: z.string().datetime({ offset: true }).optional(),
    durationMin: durationMinSchema.optional(),
    notes: z.string().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

const EVENT_COLUMNS = `id, tutor_id, group_id, title, start_utc, duration_min, notes,
  recurring_personal_schedule_id, created_at, updated_at`;

export const personalEventsRouter = Router();

personalEventsRouter.use(requireAuth);

personalEventsRouter.get('/', async (req, res, next) => {
  try {
    const q = validate(listQuerySchema, req.query);
    const from = new Date(q.from);
    const to = new Date(q.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      throw new AppError('VALIDATION', 400, 'Invalid date range', { from: 'must be before to' });
    }

    await topUpRecurringPersonalSchedules(req.tutorId!);

    const result = await query<PersonalEventRow>(
      `SELECT ${EVENT_COLUMNS}
       FROM personal_events
       WHERE tutor_id = $1 AND start_utc >= $2 AND start_utc < $3
       ORDER BY start_utc`,
      [req.tutorId, from.toISOString(), to.toISOString()],
    );
    res.json(result.rows.map(toPersonalEvent));
  } catch (err) {
    next(err);
  }
});

personalEventsRouter.post('/', async (req, res, next) => {
  try {
    const body = validate(createPersonalEventSchema, req.body);
    await assertPersonalEventGroupOwned(req.tutorId!, body.groupId);

    const inserted = await query<PersonalEventRow>(
      `INSERT INTO personal_events (tutor_id, group_id, title, start_utc, duration_min, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${EVENT_COLUMNS}`,
      [
        req.tutorId,
        body.groupId,
        body.title,
        new Date(body.startUtc).toISOString(),
        body.durationMin,
        body.notes ?? null,
      ],
    );
    res.status(201).json(toPersonalEvent(inserted.rows[0]!));
  } catch (err) {
    next(err);
  }
});

personalEventsRouter.patch('/:id', async (req, res, next) => {
  const client = await getPool().connect();
  try {
    const body = validate(patchPersonalEventSchema, req.body);
    if (body.groupId) {
      await assertPersonalEventGroupOwned(req.tutorId!, body.groupId);
    }

    await client.query('BEGIN');

    const existing = await client.query<PersonalEventRow>(
      `SELECT ${EVENT_COLUMNS}
       FROM personal_events WHERE id = $1 AND tutor_id = $2 FOR UPDATE`,
      [req.params.id, req.tutorId],
    );
    const row = existing.rows[0];
    if (!row) {
      throw new AppError('NOT_FOUND', 404, 'Personal event not found');
    }

    if (body.startUtc !== undefined && row.recurring_personal_schedule_id) {
      const newStart = new Date(body.startUtc).toISOString();
      const oldStart = row.start_utc.toISOString();
      if (newStart !== oldStart) {
        await skipRecurringPersonalOccurrence(
          client,
          row.recurring_personal_schedule_id,
          row.start_utc,
        );
      }
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (body.groupId !== undefined) {
      fields.push(`group_id = $${idx++}`);
      values.push(body.groupId);
    }
    if (body.title !== undefined) {
      fields.push(`title = $${idx++}`);
      values.push(body.title);
    }
    if (body.startUtc !== undefined) {
      fields.push(`start_utc = $${idx++}`);
      values.push(new Date(body.startUtc).toISOString());
    }
    if (body.durationMin !== undefined) {
      fields.push(`duration_min = $${idx++}`);
      values.push(body.durationMin);
    }
    if (body.notes !== undefined) {
      fields.push(`notes = $${idx++}`);
      values.push(body.notes);
    }

    if (fields.length > 0) {
      fields.push('updated_at = now()');
      values.push(req.params.id, req.tutorId);
      await client.query(
        `UPDATE personal_events SET ${fields.join(', ')}
         WHERE id = $${idx++} AND tutor_id = $${idx}`,
        values,
      );
    }

    const updated = await client.query<PersonalEventRow>(
      `SELECT ${EVENT_COLUMNS} FROM personal_events WHERE id = $1`,
      [req.params.id],
    );

    await client.query('COMMIT');
    res.json(toPersonalEvent(updated.rows[0]!));
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

personalEventsRouter.delete('/:id', async (req, res, next) => {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query<PersonalEventRow>(
      `SELECT ${EVENT_COLUMNS}
       FROM personal_events WHERE id = $1 AND tutor_id = $2 FOR UPDATE`,
      [req.params.id, req.tutorId],
    );
    const row = existing.rows[0];
    if (!row) {
      throw new AppError('NOT_FOUND', 404, 'Personal event not found');
    }

    if (row.recurring_personal_schedule_id) {
      await skipRecurringPersonalOccurrence(
        client,
        row.recurring_personal_schedule_id,
        row.start_utc,
      );
    }

    await client.query('DELETE FROM personal_events WHERE id = $1 AND tutor_id = $2', [
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
