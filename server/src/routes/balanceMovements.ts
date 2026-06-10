import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { validate } from '../validate.js';
import { requireAuth } from '../middleware/requireAuth.js';
import type { BalanceMovementKind } from '../balanceMovements.js';

const listQuerySchema = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  studentId: z.string().uuid().optional(),
});

export interface BalanceMovementRow {
  id: string;
  student_id: string;
  charged_for_student_id: string | null;
  lesson_id: string | null;
  occurred_at: string;
  kind: BalanceMovementKind;
  prepaid_delta: string;
  debt_delta: string;
  prepaid_after: string;
  debt_after: string;
  balance_kind: 'money' | 'lessons';
}

export interface BalanceMovementDto {
  id: string;
  studentId: string;
  chargedForStudentId: string | null;
  lessonId: string | null;
  occurredAt: string;
  kind: BalanceMovementKind;
  prepaidDelta: number;
  debtDelta: number;
  prepaidAfter: number;
  debtAfter: number;
  balanceKind: 'money' | 'lessons';
}

function toMovement(row: BalanceMovementRow): BalanceMovementDto {
  return {
    id: row.id,
    studentId: row.student_id,
    chargedForStudentId: row.charged_for_student_id,
    lessonId: row.lesson_id,
    occurredAt: row.occurred_at,
    kind: row.kind,
    prepaidDelta: Number(row.prepaid_delta),
    debtDelta: Number(row.debt_delta),
    prepaidAfter: Number(row.prepaid_after),
    debtAfter: Number(row.debt_after),
    balanceKind: row.balance_kind,
  };
}

export const balanceMovementsRouter = Router();

balanceMovementsRouter.use(requireAuth);

balanceMovementsRouter.get('/', async (req, res, next) => {
  try {
    const q = validate(listQuerySchema, req.query);
    const params: unknown[] = [req.tutorId, q.from, q.to];
    let studentFilter = '';
    if (q.studentId) {
      const student = await query<{ billing_student_id: string | null }>(
        `SELECT billing_student_id FROM students WHERE id = $1 AND tutor_id = $2`,
        [q.studentId, req.tutorId],
      );
      const row = student.rows[0];
      if (!row) {
        res.json([]);
        return;
      }
      if (row.billing_student_id) {
        // Dependent: wallet is on payer; include family charges + legacy own-wallet rows.
        studentFilter = ` AND (
          m.charged_for_student_id = $4
          OR (m.student_id = $4 AND m.charged_for_student_id IS NULL)
        )`;
      } else {
        // Payer / independent: all movements on this wallet (incl. charges for dependents).
        studentFilter = ' AND m.student_id = $4';
      }
      params.push(q.studentId);
    } else {
      studentFilter = ` AND EXISTS (
        SELECT 1 FROM students s
        WHERE s.id = m.student_id AND s.archived_at IS NULL
      )`;
    }

    const result = await query<BalanceMovementRow>(
      `SELECT m.id, m.student_id, m.charged_for_student_id, m.lesson_id, m.occurred_at, m.kind,
              m.prepaid_delta, m.debt_delta, m.prepaid_after, m.debt_after,
              m.balance_kind
       FROM balance_movements m
       WHERE m.tutor_id = $1
         AND m.occurred_at >= $2
         AND m.occurred_at < $3
         AND NOT EXISTS (
           SELECT 1 FROM tax_replenishment_meta t
           WHERE t.balance_movement_id = m.id AND t.manual_amount IS NOT NULL
         )
         ${studentFilter}
       ORDER BY m.occurred_at DESC, m.created_at DESC`,
      params,
    );

    res.json(result.rows.map(toMovement));
  } catch (err) {
    next(err);
  }
});
