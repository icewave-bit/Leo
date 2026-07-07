import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { AppError } from '../errors.js';
import { toPersonalEventGroup, type PersonalEventGroupRow } from '../mappers.js';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  assertPersonalEventGroupOwned,
  ensureDefaultPersonalEventGroups,
} from '../personalEventGroups.js';
import { validate } from '../validate.js';

const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: hexColorSchema,
  sortOrder: z.number().int().min(0).max(100).optional(),
});

const patchGroupSchema = z
  .object({
    name: z.string().trim().min(1).max(40).optional(),
    color: hexColorSchema.optional(),
    sortOrder: z.number().int().min(0).max(100).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

const deleteGroupQuerySchema = z.object({
  reassignTo: z.string().uuid().optional(),
});

const GROUP_COLUMNS = `id, tutor_id, name, color, sort_order, created_at, updated_at`;

export const personalEventGroupsRouter = Router();

personalEventGroupsRouter.use(requireAuth);

personalEventGroupsRouter.get('/', async (req, res, next) => {
  try {
    const rows = await ensureDefaultPersonalEventGroups(req.tutorId!);
    res.json(rows.map(toPersonalEventGroup));
  } catch (err) {
    next(err);
  }
});

personalEventGroupsRouter.post('/', async (req, res, next) => {
  try {
    const body = validate(createGroupSchema, req.body);
    const maxSort = await query<{ max: number | null }>(
      `SELECT MAX(sort_order) AS max FROM personal_event_groups WHERE tutor_id = $1`,
      [req.tutorId],
    );
    const sortOrder = body.sortOrder ?? (maxSort.rows[0]?.max ?? -1) + 1;

    const inserted = await query<PersonalEventGroupRow>(
      `INSERT INTO personal_event_groups (tutor_id, name, color, sort_order)
       VALUES ($1, $2, $3, $4)
       RETURNING ${GROUP_COLUMNS}`,
      [req.tutorId, body.name, body.color, sortOrder],
    );
    res.status(201).json(toPersonalEventGroup(inserted.rows[0]!));
  } catch (err) {
    next(err);
  }
});

personalEventGroupsRouter.patch('/:id', async (req, res, next) => {
  try {
    const body = validate(patchGroupSchema, req.body);
    await assertPersonalEventGroupOwned(req.tutorId!, req.params.id);

    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (body.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(body.name);
    }
    if (body.color !== undefined) {
      fields.push(`color = $${idx++}`);
      values.push(body.color);
    }
    if (body.sortOrder !== undefined) {
      fields.push(`sort_order = $${idx++}`);
      values.push(body.sortOrder);
    }

    fields.push('updated_at = now()');
    values.push(req.params.id, req.tutorId);

    const updated = await query<PersonalEventGroupRow>(
      `UPDATE personal_event_groups SET ${fields.join(', ')}
       WHERE id = $${idx++} AND tutor_id = $${idx}
       RETURNING ${GROUP_COLUMNS}`,
      values,
    );
    res.json(toPersonalEventGroup(updated.rows[0]!));
  } catch (err) {
    next(err);
  }
});

personalEventGroupsRouter.delete('/:id', async (req, res, next) => {
  try {
    const q = validate(deleteGroupQuerySchema, req.query);
    await assertPersonalEventGroupOwned(req.tutorId!, req.params.id);

    const usage = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM personal_events WHERE group_id = $1 AND tutor_id = $2`,
      [req.params.id, req.tutorId],
    );
    const count = Number(usage.rows[0]?.count ?? 0);

    if (count > 0 && !q.reassignTo) {
      throw new AppError(
        'CONFLICT',
        409,
        'Group has personal events. Provide reassignTo group id.',
      );
    }

    if (count > 0 && q.reassignTo) {
      await assertPersonalEventGroupOwned(req.tutorId!, q.reassignTo);
      await query(
        `UPDATE personal_events SET group_id = $1, updated_at = now()
         WHERE group_id = $2 AND tutor_id = $3`,
        [q.reassignTo, req.params.id, req.tutorId],
      );
      await query(
        `UPDATE recurring_personal_schedules SET group_id = $1, updated_at = now()
         WHERE group_id = $2 AND tutor_id = $3`,
        [q.reassignTo, req.params.id, req.tutorId],
      );
    }

    await query('DELETE FROM personal_event_groups WHERE id = $1 AND tutor_id = $2', [
      req.params.id,
      req.tutorId,
    ]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
