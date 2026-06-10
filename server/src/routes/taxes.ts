import { Router } from 'express';
import { z } from 'zod';
import { getPool, query } from '../db.js';
import { AppError } from '../errors.js';
import { validate } from '../validate.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { getNbrbApiBase } from '../config.js';
import { convertToByn, fetchNbrbRate } from '../nbrb.js';
import { assertActiveStudentOwned } from '../studentAccess.js';
import {
  isTaxableIncomeMovement,
  lessonPaidDeltaAsMoney,
  monthBoundsDates,
  movementReceivedDate,
  replenishDeltaAsMoney,
  roundMoney,
} from '../taxReplenishments.js';
import type { BalanceMovementKind } from '../balanceMovements.js';

const listQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  studentId: z.string().uuid().optional(),
});

const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const patchBodySchema = z
  .object({
    taxPaid: z.boolean().optional(),
    comment: z.string().max(2000).optional(),
    receivedOn: dateKeySchema.optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one field is required' });

const createBodySchema = z.object({
  studentId: z.string().uuid(),
  receivedOn: dateKeySchema,
  currency: z.enum(['EUR', 'RUB', 'USD', 'BYN']),
  amount: z.number().positive(),
});

interface MovementRow {
  id: string;
  student_id: string;
  occurred_at: string;
  received_on: string | null;
  kind: BalanceMovementKind;
  prepaid_delta: string;
  prepaid_after: string;
  debt_delta: string;
  balance_kind: 'money' | 'lessons';
  student_name: string;
  currency: string;
  rate: string | null;
  tax_paid: boolean | null;
  comment: string | null;
  manual_currency: string | null;
  manual_amount: string | null;
}

const MOVEMENT_SELECT = `SELECT m.id, m.student_id, m.occurred_at, m.received_on::text AS received_on, m.kind,
              m.prepaid_delta, m.prepaid_after, m.debt_delta, m.balance_kind,
              s.name AS student_name, s.currency, s.rate,
              t.tax_paid, t.comment, t.manual_currency, t.manual_amount`;

export interface TaxReplenishmentDto {
  movementId: string;
  studentId: string;
  studentName: string;
  occurredAt: string;
  replenishmentDate: string;
  balanceKind: 'money' | 'lessons';
  /** Delta in movement units (money or lessons). */
  sourceAmount: number;
  /** Taxable amount in student currency. */
  amount: number;
  currency: string;
  amountByn: number | null;
  conversionError: string | null;
  taxPaid: boolean;
  comment: string;
}

export const taxesRouter = Router();

taxesRouter.use(requireAuth);

async function toTaxReplenishmentDto(
  row: MovementRow,
  timezone: string,
  convertToBynEnabled: boolean,
  apiBase: string,
): Promise<TaxReplenishmentDto | null> {
  const prepaidDelta = Number(row.prepaid_delta);
  const prepaidAfter = Number(row.prepaid_after);
  const debtDelta = Number(row.debt_delta);
  if (
    !isTaxableIncomeMovement({
      kind: row.kind,
      prepaidDelta,
      prepaidAfter,
      debtDelta,
    })
  ) {
    return null;
  }

  const manualAmount =
    row.manual_amount != null ? Number(row.manual_amount) : null;
  const currency = row.manual_currency ?? row.currency;
  const studentRate = row.rate != null ? Number(row.rate) : null;
  const sourceAmount =
    manualAmount != null
      ? manualAmount
      : row.kind === 'lesson_paid'
        ? -debtDelta
        : prepaidDelta;
  const moneyAmount =
    manualAmount != null
      ? manualAmount
      : row.kind === 'lesson_paid'
        ? lessonPaidDeltaAsMoney(debtDelta, row.balance_kind, studentRate)
        : replenishDeltaAsMoney(prepaidDelta, row.balance_kind, studentRate);

  const replenishmentDate = movementReceivedDate(
    row.received_on,
    row.occurred_at,
    timezone,
  );
  let amountByn: number | null = null;
  let conversionError: string | null = null;

  if (moneyAmount == null) {
    conversionError = 'Не задана ставка для пересчёта уроков в деньги';
  } else if (convertToBynEnabled) {
    try {
      const nbrbRate =
        currency === 'BYN'
          ? null
          : await fetchNbrbRate(currency, replenishmentDate, apiBase);
      amountByn = convertToByn(moneyAmount, currency, nbrbRate);
    } catch (err) {
      conversionError =
        err instanceof Error ? err.message : 'Не удалось конвертировать в BYN';
    }
  }

  return {
    movementId: row.id,
    studentId: row.student_id,
    studentName: row.student_name,
    occurredAt: row.occurred_at,
    replenishmentDate,
    balanceKind: manualAmount != null ? 'money' : row.balance_kind,
    sourceAmount,
    amount: moneyAmount ?? 0,
    currency,
    amountByn,
    conversionError,
    taxPaid: row.tax_paid ?? false,
    comment: row.comment ?? '',
  };
}

async function loadTaxMovementRow(
  movementId: string,
  tutorId: string,
): Promise<MovementRow | null> {
  const result = await query<MovementRow>(
    `${MOVEMENT_SELECT}
     FROM balance_movements m
     JOIN students s ON s.id = m.student_id
       AND s.exclude_from_taxes = false
       AND s.archived_at IS NULL
     LEFT JOIN tax_replenishment_meta t ON t.balance_movement_id = m.id
     WHERE m.id = $1 AND m.tutor_id = $2
       AND COALESCE(t.excluded, false) = false`,
    [movementId, tutorId],
  );
  return result.rows[0] ?? null;
}

taxesRouter.post('/', async (req, res, next) => {
  const client = await getPool().connect();
  try {
    const body = validate(createBodySchema, req.body);
    await assertActiveStudentOwned(req.tutorId!, body.studentId);

    const student = await client.query<{
      prepaid: string;
      debt: string;
      tutor_id: string;
      balance_kind: 'money' | 'lessons';
      exclude_from_taxes: boolean;
    }>(
      `SELECT prepaid, debt, tutor_id, balance_kind, exclude_from_taxes
       FROM students
       WHERE id = $1 AND tutor_id = $2 AND archived_at IS NULL`,
      [body.studentId, req.tutorId],
    );
    const st = student.rows[0];
    if (!st) {
      throw new AppError('NOT_FOUND', 404, 'Ученик не найден');
    }
    if (st.exclude_from_taxes) {
      throw new AppError(
        'VALIDATION',
        400,
        'Ученик исключён из налогового учёта',
      );
    }

    const amount = roundMoney(body.amount);
    const occurredAt = `${body.receivedOn}T12:00:00.000Z`;

    await client.query('BEGIN');

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO balance_movements (
         tutor_id, student_id, occurred_at, received_on, kind,
         prepaid_delta, debt_delta, prepaid_after, debt_after, balance_kind
       ) VALUES ($1, $2, $3, $4, 'replenish', $5, 0, $6, $7, $8)
       RETURNING id`,
      [
        req.tutorId,
        body.studentId,
        occurredAt,
        body.receivedOn,
        amount,
        Number(st.prepaid),
        Number(st.debt),
        st.balance_kind,
      ],
    );
    const movementId = inserted.rows[0]!.id;

    await client.query(
      `INSERT INTO tax_replenishment_meta (
         balance_movement_id, tutor_id, manual_currency, manual_amount, updated_at
       ) VALUES ($1, $2, $3, $4, now())`,
      [movementId, req.tutorId, body.currency, amount],
    );

    await client.query('COMMIT');

    const tutor = await query<{
      timezone: string;
      tax_display_currency: 'BYN' | 'none';
    }>(
      'SELECT timezone, tax_display_currency FROM tutors WHERE id = $1',
      [req.tutorId],
    );
    const timezone = tutor.rows[0]?.timezone ?? 'UTC';
    const convertToBynEnabled = tutor.rows[0]?.tax_display_currency === 'BYN';
    const row = await loadTaxMovementRow(movementId, req.tutorId!);
    if (!row) {
      throw new AppError('INTERNAL', 500, 'Не удалось создать запись');
    }

    const dto = await toTaxReplenishmentDto(
      row,
      timezone,
      convertToBynEnabled,
      getNbrbApiBase(),
    );
    if (!dto) {
      throw new AppError('INTERNAL', 500, 'Не удалось создать запись');
    }

    res.status(201).json(dto);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

taxesRouter.get('/', async (req, res, next) => {
  try {
    const q = validate(listQuerySchema, req.query);
    const tutor = await query<{
      timezone: string;
      tax_display_currency: 'BYN' | 'none';
    }>(
      'SELECT timezone, tax_display_currency FROM tutors WHERE id = $1',
      [req.tutorId],
    );
    const timezone = tutor.rows[0]?.timezone ?? 'UTC';
    const convertToBynEnabled = tutor.rows[0]?.tax_display_currency === 'BYN';
    const { from, to } = monthBoundsDates(q.month);

    const params: unknown[] = [req.tutorId, from, to];
    let studentFilter = '';
    if (q.studentId) {
      studentFilter = ' AND m.student_id = $4';
      params.push(q.studentId);
    }

    const result = await query<MovementRow>(
      `${MOVEMENT_SELECT}
       FROM balance_movements m
       JOIN students s ON s.id = m.student_id
         AND s.exclude_from_taxes = false
         AND s.archived_at IS NULL
       LEFT JOIN tax_replenishment_meta t ON t.balance_movement_id = m.id
       WHERE m.tutor_id = $1
         AND COALESCE(t.excluded, false) = false
         AND COALESCE(m.received_on, m.occurred_at::date) >= $2::date
         AND COALESCE(m.received_on, m.occurred_at::date) < $3::date
         AND (
           (m.kind = 'replenish' AND m.prepaid_delta > 0)
           OR (
             m.kind = 'lesson_paid'
             AND m.debt_delta < 0
             AND NOT EXISTS (
               SELECT 1 FROM balance_movements r
               WHERE r.student_id = m.student_id
                 AND r.tutor_id = m.tutor_id
                 AND r.kind = 'replenish'
                 AND r.prepaid_delta > 0
                 AND r.created_at = m.created_at
             )
           )
         )
         ${studentFilter}
       ORDER BY m.occurred_at DESC, m.created_at DESC`,
      params,
    );

    const apiBase = getNbrbApiBase();
    const rows: TaxReplenishmentDto[] = [];

    for (const row of result.rows) {
      const dto = await toTaxReplenishmentDto(
        row,
        timezone,
        convertToBynEnabled,
        apiBase,
      );
      if (dto) rows.push(dto);
    }

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

async function assertTaxableMovement(movementId: string, tutorId: string) {
  const movement = await query<{
    id: string;
    kind: BalanceMovementKind;
    balance_kind: string;
    prepaid_delta: string;
    prepaid_after: string;
    debt_delta: string;
  }>(
    `SELECT id, kind, balance_kind, prepaid_delta, prepaid_after, debt_delta
     FROM balance_movements
     WHERE id = $1 AND tutor_id = $2
       AND (
         (kind = 'replenish' AND prepaid_delta > 0)
         OR (
           kind = 'lesson_paid'
           AND debt_delta < 0
           AND NOT EXISTS (
             SELECT 1 FROM balance_movements r
             WHERE r.student_id = balance_movements.student_id
               AND r.tutor_id = balance_movements.tutor_id
               AND r.kind = 'replenish'
               AND r.prepaid_delta > 0
               AND r.created_at = balance_movements.created_at
           )
         )
       )`,
    [movementId, tutorId],
  );

  const row = movement.rows[0];
  if (
    !row ||
    !isTaxableIncomeMovement({
      kind: row.kind,
      prepaidDelta: Number(row.prepaid_delta),
      prepaidAfter: Number(row.prepaid_after),
      debtDelta: Number(row.debt_delta),
    })
  ) {
    return null;
  }
  return row;
}

taxesRouter.patch('/:movementId', async (req, res, next) => {
  try {
    const movementId = req.params.movementId;
    const body = validate(patchBodySchema, req.body);

    const row = await assertTaxableMovement(movementId, req.tutorId!);
    if (!row) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Запись не найдена' },
      });
      return;
    }

    const existing = await query<{ tax_paid: boolean; comment: string }>(
      `SELECT tax_paid, comment FROM tax_replenishment_meta WHERE balance_movement_id = $1`,
      [movementId],
    );
    const prev = existing.rows[0];
    const taxPaid = body.taxPaid ?? prev?.tax_paid ?? false;
    const comment = body.comment ?? prev?.comment ?? '';

    if (body.taxPaid !== undefined || body.comment !== undefined) {
      await query(
        `INSERT INTO tax_replenishment_meta (balance_movement_id, tutor_id, tax_paid, comment, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (balance_movement_id) DO UPDATE
         SET tax_paid = EXCLUDED.tax_paid,
             comment = EXCLUDED.comment,
             updated_at = now()`,
        [movementId, req.tutorId, taxPaid, comment],
      );
    }

    if (body.receivedOn !== undefined) {
      await query(
        `UPDATE balance_movements SET received_on = $1 WHERE id = $2 AND tutor_id = $3`,
        [body.receivedOn, movementId, req.tutorId],
      );
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

taxesRouter.delete('/:movementId', async (req, res, next) => {
  try {
    const movementId = req.params.movementId;
    const row = await assertTaxableMovement(movementId, req.tutorId!);
    if (!row) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Запись не найдена' },
      });
      return;
    }

    await query(
      `INSERT INTO tax_replenishment_meta (balance_movement_id, tutor_id, excluded, updated_at)
       VALUES ($1, $2, true, now())
       ON CONFLICT (balance_movement_id) DO UPDATE
       SET excluded = true,
           updated_at = now()`,
      [movementId, req.tutorId],
    );

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
