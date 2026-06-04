import { Router } from 'express';
import { z } from 'zod';
import { getPool, query } from '../db.js';
import { recordStudentBalancePatch } from '../balanceMovements.js';
import { settleLessonsFromBalanceTopUp } from '../lessonBalance.js';
import { AppError } from '../errors.js';
import { deriveInitials } from '../auth/password.js';
import { toStudent, type StudentRow } from '../mappers.js';
import { validate } from '../validate.js';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  archiveStudent,
  purgeArchivedStudent,
  restoreStudent,
} from '../studentLifecycle.js';

const studentFieldsSchema = {
  name: z.string().min(1),
  initials: z.string().min(1).optional(),
  hue: z.number().int().min(0).max(360),
  tz: z.string().min(1),
  meetUrl: z.string().url().nullable(),
  rate: z.number().min(0).nullable(),
  currency: z.string().length(3),
  note: z.string().nullable(),
  isGroup: z.boolean(),
  members: z.array(z.string()),
  balanceKind: z.enum(['money', 'lessons']),
  prepaid: z.number().min(0),
  debt: z.number().min(0),
};

const createStudentSchema = z.object({
  name: studentFieldsSchema.name,
  initials: studentFieldsSchema.initials,
  hue: studentFieldsSchema.hue.default(250),
  tz: studentFieldsSchema.tz.optional(),
  meetUrl: studentFieldsSchema.meetUrl.optional(),
  rate: studentFieldsSchema.rate.optional(),
  currency: studentFieldsSchema.currency.default('EUR'),
  note: studentFieldsSchema.note.optional(),
  isGroup: studentFieldsSchema.isGroup.default(false),
  members: studentFieldsSchema.members.default([]),
  balanceKind: studentFieldsSchema.balanceKind.default('money'),
  prepaid: studentFieldsSchema.prepaid.default(0),
  debt: studentFieldsSchema.debt.default(0),
});

const patchStudentSchema = z
  .object({
    name: studentFieldsSchema.name.optional(),
    initials: studentFieldsSchema.initials,
    hue: studentFieldsSchema.hue.optional(),
    tz: studentFieldsSchema.tz.optional(),
    meetUrl: studentFieldsSchema.meetUrl.optional(),
    rate: studentFieldsSchema.rate.optional(),
    currency: studentFieldsSchema.currency.optional(),
    note: studentFieldsSchema.note.optional(),
    isGroup: studentFieldsSchema.isGroup.optional(),
    members: studentFieldsSchema.members.optional(),
    balanceKind: studentFieldsSchema.balanceKind.optional(),
    prepaid: studentFieldsSchema.prepaid.optional(),
    debt: studentFieldsSchema.debt.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

const STUDENT_COLUMNS = `id, tutor_id, name, initials, hue, tz, meet_url, rate, currency, note,
              is_group, members, balance_kind, prepaid, debt, archived_at, created_at`;

export const studentsRouter = Router();

studentsRouter.use(requireAuth);

studentsRouter.get('/', async (req, res, next) => {
  try {
    const result = await query<StudentRow>(
      `SELECT ${STUDENT_COLUMNS}
       FROM students WHERE tutor_id = $1 AND archived_at IS NULL ORDER BY name`,
      [req.tutorId],
    );
    res.json(result.rows.map(toStudent));
  } catch (err) {
    next(err);
  }
});

studentsRouter.get('/archived/list', async (req, res, next) => {
  try {
    const result = await query<StudentRow>(
      `SELECT ${STUDENT_COLUMNS}
       FROM students
       WHERE tutor_id = $1 AND archived_at IS NOT NULL
       ORDER BY archived_at DESC`,
      [req.tutorId],
    );
    res.json(result.rows.map(toStudent));
  } catch (err) {
    next(err);
  }
});

studentsRouter.get('/:id', async (req, res, next) => {
  try {
    const result = await query<StudentRow>(
      `SELECT ${STUDENT_COLUMNS}
       FROM students WHERE id = $1 AND tutor_id = $2`,
      [req.params.id, req.tutorId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new AppError('NOT_FOUND', 404, 'Student not found');
    }
    res.json(toStudent(row));
  } catch (err) {
    next(err);
  }
});

studentsRouter.post('/', async (req, res, next) => {
  try {
    const body = validate(createStudentSchema, req.body);

    const tutorResult = await query<{ timezone: string }>(
      'SELECT timezone FROM tutors WHERE id = $1',
      [req.tutorId],
    );
    const tutorTz = tutorResult.rows[0]?.timezone ?? 'UTC';
    const initials = body.initials ?? deriveInitials(body.name);
    const tz = body.tz ?? tutorTz;

    const inserted = await query<StudentRow>(
      `INSERT INTO students (tutor_id, name, initials, hue, tz, meet_url, rate, currency, note, is_group, members, balance_kind, prepaid, debt)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING ${STUDENT_COLUMNS}`,
      [
        req.tutorId,
        body.name,
        initials,
        body.hue,
        tz,
        body.meetUrl ?? null,
        body.rate ?? null,
        body.currency,
        body.note ?? null,
        body.isGroup,
        body.members,
        body.balanceKind,
        body.prepaid,
        body.debt,
      ],
    );
    res.status(201).json(toStudent(inserted.rows[0]!));
  } catch (err) {
    next(err);
  }
});

studentsRouter.patch('/:id', async (req, res, next) => {
  const client = await getPool().connect();
  try {
    const body = validate(patchStudentSchema, req.body);

    await client.query('BEGIN');

    const before = await client.query<StudentRow>(
      `SELECT ${STUDENT_COLUMNS} FROM students WHERE id = $1 AND tutor_id = $2 FOR UPDATE`,
      [req.params.id, req.tutorId],
    );
    const beforeRow = before.rows[0];
    if (!beforeRow) {
      throw new AppError('NOT_FOUND', 404, 'Student not found');
    }
    if (beforeRow.archived_at) {
      throw new AppError('CONFLICT', 409, 'Cannot edit archived student');
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (body.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(body.name);
    }
    if (body.initials !== undefined) {
      fields.push(`initials = $${idx++}`);
      values.push(body.initials);
    }
    if (body.hue !== undefined) {
      fields.push(`hue = $${idx++}`);
      values.push(body.hue);
    }
    if (body.tz !== undefined) {
      fields.push(`tz = $${idx++}`);
      values.push(body.tz);
    }
    if (body.meetUrl !== undefined) {
      fields.push(`meet_url = $${idx++}`);
      values.push(body.meetUrl);
    }
    if (body.rate !== undefined) {
      fields.push(`rate = $${idx++}`);
      values.push(body.rate);
    }
    if (body.currency !== undefined) {
      fields.push(`currency = $${idx++}`);
      values.push(body.currency);
    }
    if (body.note !== undefined) {
      fields.push(`note = $${idx++}`);
      values.push(body.note);
    }
    if (body.isGroup !== undefined) {
      fields.push(`is_group = $${idx++}`);
      values.push(body.isGroup);
    }
    if (body.members !== undefined) {
      fields.push(`members = $${idx++}`);
      values.push(body.members);
    }
    if (body.balanceKind !== undefined) {
      fields.push(`balance_kind = $${idx++}`);
      values.push(body.balanceKind);
    }
    if (body.prepaid !== undefined) {
      fields.push(`prepaid = $${idx++}`);
      values.push(body.prepaid);
    }
    if (body.debt !== undefined) {
      fields.push(`debt = $${idx++}`);
      values.push(body.debt);
    }

    if (fields.length === 0) {
      await client.query('ROLLBACK');
      throw new AppError('VALIDATION', 400, 'No fields to update');
    }

    values.push(req.params.id, req.tutorId);
    const idParam = idx++;
    const tutorParam = idx;

    const result = await client.query<StudentRow>(
      `UPDATE students SET ${fields.join(', ')}
       WHERE id = $${idParam} AND tutor_id = $${tutorParam}
       RETURNING ${STUDENT_COLUMNS}`,
      values,
    );
    const row = result.rows[0];
    if (!row) {
      throw new AppError('NOT_FOUND', 404, 'Student not found');
    }

    if (body.prepaid !== undefined || body.debt !== undefined) {
      const balanceKindChanged =
        body.balanceKind !== undefined && body.balanceKind !== beforeRow.balance_kind;
      const prepaidTopUp =
        body.prepaid !== undefined &&
        body.debt === undefined &&
        Number(row.prepaid) > Number(beforeRow.prepaid);
      await recordStudentBalancePatch(
        client,
        row.id,
        Number(beforeRow.prepaid),
        Number(beforeRow.debt),
        Number(row.prepaid),
        Number(row.debt),
        { balanceKindChanged, prepaidTopUp },
      );
      if (!balanceKindChanged) {
        await settleLessonsFromBalanceTopUp(
          client,
          row.id,
          Number(beforeRow.prepaid),
          Number(beforeRow.debt),
          Number(row.prepaid),
          Number(row.debt),
        );
      }
    }

    await client.query('COMMIT');
    res.json(toStudent(row));
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

studentsRouter.post('/:id/archive', async (req, res, next) => {
  try {
    await archiveStudent(req.tutorId!, req.params.id);
    const result = await query<StudentRow>(
      `SELECT ${STUDENT_COLUMNS} FROM students WHERE id = $1 AND tutor_id = $2`,
      [req.params.id, req.tutorId],
    );
    res.json(toStudent(result.rows[0]!));
  } catch (err) {
    next(err);
  }
});

studentsRouter.post('/:id/restore', async (req, res, next) => {
  try {
    await restoreStudent(req.tutorId!, req.params.id);
    const result = await query<StudentRow>(
      `SELECT ${STUDENT_COLUMNS} FROM students WHERE id = $1 AND tutor_id = $2`,
      [req.params.id, req.tutorId],
    );
    res.json(toStudent(result.rows[0]!));
  } catch (err) {
    next(err);
  }
});

studentsRouter.delete('/:id', async (req, res, next) => {
  try {
    await purgeArchivedStudent(req.tutorId!, req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
