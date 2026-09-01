import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { toActivityLog, type ActivityLogRow } from '../activityLog.js';
import { AppError } from '../errors.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../validate.js';

const listQuerySchema = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  status: z.enum(['ok', 'error']).optional(),
  actor: z.enum(['user', 'system', 'bot']).optional(),
  entityType: z
    .enum([
      'student',
      'lesson',
      'personal_event',
      'settings',
      'balance',
      'tax',
      'schedule',
      'auth',
      'other',
    ])
    .optional(),
  studentId: z.string().uuid().optional(),
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(80),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

export const activityLogRouter = Router();

activityLogRouter.use(requireAuth);

activityLogRouter.get('/', async (req, res, next) => {
  try {
    const q = validate(listQuerySchema, req.query);
    const from = new Date(q.from);
    const to = new Date(q.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      res.json({ items: [], total: 0 });
      return;
    }

    const where: string[] = ['tutor_id = $1', 'occurred_at >= $2', 'occurred_at < $3'];
    const params: unknown[] = [req.tutorId, from.toISOString(), to.toISOString()];
    let i = 4;

    if (q.status) {
      where.push(`status = $${i++}`);
      params.push(q.status);
    }
    if (q.actor) {
      where.push(`actor = $${i++}`);
      params.push(q.actor);
    }
    if (q.entityType) {
      where.push(`entity_type = $${i++}`);
      params.push(q.entityType);
    }
    if (q.studentId) {
      where.push(`student_id = $${i++}`);
      params.push(q.studentId);
    }
    if (q.q) {
      where.push(
        `(summary ILIKE $${i} OR COALESCE(error_message, '') ILIKE $${i} OR COALESCE(entity_label, '') ILIKE $${i})`,
      );
      params.push(`%${q.q}%`);
      i += 1;
    }

    const whereSql = where.join(' AND ');

    const count = await query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM activity_logs WHERE ${whereSql}`,
      params,
    );
    const result = await query<ActivityLogRow>(
      `SELECT id, occurred_at, status, actor, action, entity_type, entity_id, entity_label,
              student_id, summary, details, error_code, error_message,
              http_method, http_path, http_status
       FROM activity_logs
       WHERE ${whereSql}
       ORDER BY occurred_at DESC, id DESC
       LIMIT $${i++} OFFSET $${i}`,
      [...params, q.limit, q.offset],
    );

    res.json({
      items: result.rows.map(toActivityLog),
      total: Number(count.rows[0]?.n ?? 0),
    });
  } catch (err) {
    next(err);
  }
});

const relatedParamsSchema = z.object({
  id: z.string().uuid(),
});

activityLogRouter.get('/:id/related', async (req, res, next) => {
  try {
    const { id } = validate(relatedParamsSchema, req.params);
    const parent = await query<ActivityLogRow>(
      `SELECT id, occurred_at, status, actor, action, entity_type, entity_id, entity_label,
              student_id, summary, details, error_code, error_message,
              http_method, http_path, http_status
       FROM activity_logs
       WHERE id = $1 AND tutor_id = $2`,
      [id, req.tutorId],
    );
    const row = parent.rows[0];
    if (!row) {
      throw new AppError('NOT_FOUND', 404, 'Activity log not found');
    }
    if (!row.entity_id) {
      res.json({ items: [] });
      return;
    }

    const later = await query<ActivityLogRow>(
      `SELECT id, occurred_at, status, actor, action, entity_type, entity_id, entity_label,
              student_id, summary, details, error_code, error_message,
              http_method, http_path, http_status
       FROM activity_logs
       WHERE tutor_id = $1
         AND id <> $2
         AND entity_id = $3
         AND occurred_at > $4
       ORDER BY occurred_at ASC, id ASC
       LIMIT 24`,
      [req.tutorId, row.id, row.entity_id, row.occurred_at],
    );

    res.json({ items: later.rows.map(toActivityLog) });
  } catch (err) {
    next(err);
  }
});
