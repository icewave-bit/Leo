import { Router } from 'express';
import { z } from 'zod';
import { getPool, query } from '../db.js';
import { recordStudentBalancePatch } from '../balanceMovements.js';
import { settleLessonsFromBalanceTopUp, settleFamilyDebtsFromPrepaid } from '../lessonBalance.js';
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
import { loadOpenLessonDebts, loadBillingDebtBreakdown } from '../billingDebt.js';
import {
  migrateDependentWalletToPayer,
} from '../billingWalletMigrate.js';
import {
  assertBalanceEditable,
  validateBillingPayer,
  validateBillingStudentAssignment,
} from '../billingStudent.js';

const studentFieldsSchema = {
  name: z.string().min(1),
  initials: z.string().min(1).max(2).optional(),
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
  excludeFromTaxes: z.boolean().optional(),
  billingStudentId: z.string().uuid().nullable().optional(),
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
    receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    excludeFromTaxes: z.boolean().optional(),
    billingStudentId: z.string().uuid().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

const STUDENT_COLUMNS = `id, tutor_id, name, initials, hue, tz, meet_url, rate, currency, note,
              is_group, members, balance_kind, prepaid, debt, exclude_from_taxes, billing_student_id,
              archived_at, created_at`;

export const studentsRouter = Router();

studentsRouter.use(requireAuth);

studentsRouter.get('/', async (req, res, next) => {
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
    res.json(
      result.rows.map((row) => toStudent(row, openDebts.get(row.id) ?? 0)),
    );
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
    res.json(result.rows.map((row) => toStudent(row, 0)));
  } catch (err) {
    next(err);
  }
});

studentsRouter.get('/:id/billing-debt', async (req, res, next) => {
  try {
    const breakdown = await loadBillingDebtBreakdown(req.tutorId!, req.params.id);
    if (!breakdown) {
      throw new AppError('NOT_FOUND', 404, 'Student not found');
    }
    res.json(breakdown);
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
    const openDebts = await loadOpenLessonDebts(req.tutorId!, [row.id]);
    res.json(toStudent(row, openDebts.get(row.id) ?? 0));
  } catch (err) {
    next(err);
  }
});

studentsRouter.post('/', async (req, res, next) => {
  const client = await getPool().connect();
  try {
    const body = validate(createStudentSchema, req.body);

    const tutorResult = await client.query<{ timezone: string }>(
      'SELECT timezone FROM tutors WHERE id = $1',
      [req.tutorId],
    );
    const tutorTz = tutorResult.rows[0]?.timezone ?? 'UTC';
    const initials = body.initials ?? deriveInitials(body.name);
    const tz = body.tz ?? tutorTz;

    const billingStudentId = body.billingStudentId ?? null;
    if (body.isGroup && billingStudentId) {
      throw new AppError('VALIDATION', 400, 'Groups cannot use a shared billing account');
    }

    let balanceKind = body.balanceKind;
    let currency = body.currency;
    let prepaid = body.prepaid;
    let debt = body.debt;
    let excludeFromTaxes = body.excludeFromTaxes ?? false;
    const initialPrepaid = body.prepaid;
    const initialDebt = body.debt;
    const initialBalanceKind = body.balanceKind;
    const initialRate = body.rate ?? null;

    if (billingStudentId) {
      const payerRow = await validateBillingPayer(client, req.tutorId!, billingStudentId);
      balanceKind = payerRow.balance_kind;
      currency = payerRow.currency;
      prepaid = 0;
      debt = 0;
      excludeFromTaxes = true;
    }

    await client.query('BEGIN');

    const inserted = await client.query<StudentRow>(
      `INSERT INTO students (
         tutor_id, name, initials, hue, tz, meet_url, rate, currency, note,
         is_group, members, balance_kind, prepaid, debt, exclude_from_taxes, billing_student_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING ${STUDENT_COLUMNS}`,
      [
        req.tutorId,
        body.name,
        initials,
        body.hue,
        tz,
        body.meetUrl ?? null,
        body.rate ?? null,
        currency,
        body.note ?? null,
        body.isGroup,
        body.members,
        balanceKind,
        prepaid,
        debt,
        excludeFromTaxes,
        billingStudentId,
      ],
    );

    const row = inserted.rows[0]!;
    if (billingStudentId) {
      await validateBillingStudentAssignment(
        client,
        req.tutorId!,
        row.id,
        billingStudentId,
      );
      await migrateDependentWalletToPayer(
        client,
        {
          id: row.id,
          prepaid: initialPrepaid,
          debt: initialDebt,
          balanceKind: initialBalanceKind,
          rate: initialRate,
        },
        billingStudentId,
      );
      if (initialPrepaid > 0 || initialDebt > 0) {
        await settleFamilyDebtsFromPrepaid(client, billingStudentId);
      }
    }

    await client.query('COMMIT');
    res.status(201).json(toStudent(row));
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
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

    const isDependent = beforeRow.billing_student_id != null;

    const balancePatchAttempt =
      (body.prepaid !== undefined && body.prepaid !== Number(beforeRow.prepaid)) ||
      (body.debt !== undefined && body.debt !== Number(beforeRow.debt)) ||
      (body.balanceKind !== undefined && body.balanceKind !== beforeRow.balance_kind) ||
      (body.excludeFromTaxes !== undefined &&
        body.excludeFromTaxes !== beforeRow.exclude_from_taxes);

    if (isDependent && balancePatchAttempt) {
      assertBalanceEditable(beforeRow);
    }

    if (isDependent && body.billingStudentId === null) {
      // unlinking — allow; balance stays 0
    } else if (
      isDependent &&
      body.billingStudentId !== undefined &&
      body.billingStudentId !== beforeRow.billing_student_id
    ) {
      throw new AppError(
        'CONFLICT',
        409,
        'Change billing payer by clearing the link first',
      );
    }

    if (body.billingStudentId !== undefined && body.billingStudentId !== null) {
      await validateBillingStudentAssignment(
        client,
        req.tutorId!,
        req.params.id,
        body.billingStudentId,
      );
    }

    const isNewBillingLink =
      body.billingStudentId !== undefined &&
      body.billingStudentId !== null &&
      beforeRow.billing_student_id === null;
    const dependentHadWallet =
      Number(beforeRow.prepaid) > 0 || Number(beforeRow.debt) > 0;

    if (isNewBillingLink && dependentHadWallet) {
      await migrateDependentWalletToPayer(
        client,
        {
          id: beforeRow.id,
          prepaid: Number(beforeRow.prepaid),
          debt: Number(beforeRow.debt),
          balanceKind: beforeRow.balance_kind,
          rate: beforeRow.rate !== null ? Number(beforeRow.rate) : null,
        },
        body.billingStudentId!,
      );
    }

    if (body.isGroup === true && (beforeRow.billing_student_id || body.billingStudentId)) {
      throw new AppError('VALIDATION', 400, 'Groups cannot use a shared billing account');
    }

    if (isDependent && body.currency !== undefined && body.currency !== beforeRow.currency) {
      throw new AppError(
        'CONFLICT',
        409,
        'Currency is synced from the billing payer',
      );
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
    if (body.currency !== undefined && body.billingStudentId === undefined) {
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
    if (body.balanceKind !== undefined && body.billingStudentId === undefined) {
      fields.push(`balance_kind = $${idx++}`);
      values.push(body.balanceKind);
    }
    if (body.prepaid !== undefined && body.billingStudentId === undefined) {
      fields.push(`prepaid = $${idx++}`);
      values.push(body.prepaid);
    }
    if (body.debt !== undefined && body.billingStudentId === undefined) {
      fields.push(`debt = $${idx++}`);
      values.push(body.debt);
    }
    if (body.excludeFromTaxes !== undefined && body.billingStudentId === undefined) {
      fields.push(`exclude_from_taxes = $${idx++}`);
      values.push(body.excludeFromTaxes);
    }
    if (body.billingStudentId !== undefined) {
      fields.push(`billing_student_id = $${idx++}`);
      values.push(body.billingStudentId);
      if (body.billingStudentId !== null) {
        const payerRow = await validateBillingPayer(
          client,
          req.tutorId!,
          body.billingStudentId,
        );
        fields.push(`prepaid = $${idx++}`);
        values.push(0);
        fields.push(`debt = $${idx++}`);
        values.push(0);
        fields.push(`balance_kind = $${idx++}`);
        values.push(payerRow.balance_kind);
        fields.push(`currency = $${idx++}`);
        values.push(payerRow.currency);
        fields.push(`exclude_from_taxes = $${idx++}`);
        values.push(true);
      } else if (beforeRow.billing_student_id) {
        fields.push(`exclude_from_taxes = $${idx++}`);
        values.push(false);
      }
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

    if (isNewBillingLink && dependentHadWallet) {
      await settleFamilyDebtsFromPrepaid(client, body.billingStudentId!);
    }

    if (body.prepaid !== undefined || body.debt !== undefined) {
      if (row.billing_student_id) {
        throw new AppError(
          'CONFLICT',
          409,
          'Balance is managed by the billing payer; edit the payer account instead',
        );
      }
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
        {
          balanceKindChanged,
          prepaidTopUp,
          receivedOn: prepaidTopUp ? body.receivedOn : undefined,
        },
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
    const openDebts = await loadOpenLessonDebts(req.tutorId!, [row.id]);
    res.json(toStudent(row, openDebts.get(row.id) ?? 0));
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
