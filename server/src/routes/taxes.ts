import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { validate } from '../validate.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { getNbrbApiBase } from '../config.js';
import { convertToByn, fetchNbrbRate } from '../nbrb.js';
import {
  isTaxableReplenish,
  monthBoundsDates,
  movementReceivedDate,
  replenishDeltaAsMoney,
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

interface MovementRow {
  id: string;
  student_id: string;
  occurred_at: string;
  received_on: string | null;
  kind: BalanceMovementKind;
  prepaid_delta: string;
  prepaid_after: string;
  balance_kind: 'money' | 'lessons';
  student_name: string;
  currency: string;
  rate: string | null;
  tax_paid: boolean | null;
  comment: string | null;
}

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
      `SELECT m.id, m.student_id, m.occurred_at, m.received_on::text AS received_on, m.kind,
              m.prepaid_delta, m.prepaid_after, m.balance_kind,
              s.name AS student_name, s.currency, s.rate,
              t.tax_paid, t.comment
       FROM balance_movements m
       JOIN students s ON s.id = m.student_id
         AND s.exclude_from_taxes = false
         AND s.archived_at IS NULL
       LEFT JOIN tax_replenishment_meta t ON t.balance_movement_id = m.id
       WHERE m.tutor_id = $1
         AND COALESCE(m.received_on, m.occurred_at::date) >= $2::date
         AND COALESCE(m.received_on, m.occurred_at::date) < $3::date
         AND m.kind = 'replenish'
         AND m.prepaid_delta > 0
         ${studentFilter}
       ORDER BY m.occurred_at DESC, m.created_at DESC`,
      params,
    );

    const apiBase = getNbrbApiBase();
    const rows: TaxReplenishmentDto[] = [];

    for (const row of result.rows) {
      const prepaidDelta = Number(row.prepaid_delta);
      const prepaidAfter = Number(row.prepaid_after);
      if (
        !isTaxableReplenish({
          kind: row.kind,
          prepaidDelta,
          prepaidAfter,
        })
      ) {
        continue;
      }

      const studentRate = row.rate != null ? Number(row.rate) : null;
      const moneyAmount = replenishDeltaAsMoney(
        prepaidDelta,
        row.balance_kind,
        studentRate,
      );

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
            row.currency === 'BYN'
              ? null
              : await fetchNbrbRate(row.currency, replenishmentDate, apiBase);
          amountByn = convertToByn(moneyAmount, row.currency, nbrbRate);
        } catch (err) {
          conversionError =
            err instanceof Error ? err.message : 'Не удалось конвертировать в BYN';
        }
      }

      rows.push({
        movementId: row.id,
        studentId: row.student_id,
        studentName: row.student_name,
        occurredAt: row.occurred_at,
        replenishmentDate,
        balanceKind: row.balance_kind,
        sourceAmount: prepaidDelta,
        amount: moneyAmount ?? 0,
        currency: row.currency,
        amountByn,
        conversionError,
        taxPaid: row.tax_paid ?? false,
        comment: row.comment ?? '',
      });
    }

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

taxesRouter.patch('/:movementId', async (req, res, next) => {
  try {
    const movementId = req.params.movementId;
    const body = validate(patchBodySchema, req.body);

    const movement = await query<{
      id: string;
      kind: BalanceMovementKind;
      balance_kind: string;
      prepaid_delta: string;
      prepaid_after: string;
    }>(
      `SELECT id, kind, balance_kind, prepaid_delta, prepaid_after
       FROM balance_movements
       WHERE id = $1 AND tutor_id = $2`,
      [movementId, req.tutorId],
    );

    const row = movement.rows[0];
    if (
      !row ||
      !isTaxableReplenish({
        kind: row.kind,
        prepaidDelta: Number(row.prepaid_delta),
        prepaidAfter: Number(row.prepaid_after),
      })
    ) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Пополнение не найдено' },
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
