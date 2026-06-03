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
  lesson_id: string | null;
  occurred_at: string;
  kind: BalanceMovementKind;
  prepaid_delta: string;
  debt_delta: string;
  prepaid_after: string;
  debt_after: string;
}

export interface BalanceMovementDto {
  id: string;
  studentId: string;
  lessonId: string | null;
  occurredAt: string;
  kind: BalanceMovementKind;
  prepaidDelta: number;
  debtDelta: number;
  prepaidAfter: number;
  debtAfter: number;
}

function toMovement(row: BalanceMovementRow): BalanceMovementDto {
  return {
    id: row.id,
    studentId: row.student_id,
    lessonId: row.lesson_id,
    occurredAt: row.occurred_at,
    kind: row.kind,
    prepaidDelta: Number(row.prepaid_delta),
    debtDelta: Number(row.debt_delta),
    prepaidAfter: Number(row.prepaid_after),
    debtAfter: Number(row.debt_after),
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
      studentFilter = ' AND m.student_id = $4';
      params.push(q.studentId);
    }

    const result = await query<BalanceMovementRow>(
      `SELECT m.id, m.student_id, m.lesson_id, m.occurred_at, m.kind,
              m.prepaid_delta, m.debt_delta, m.prepaid_after, m.debt_after
       FROM balance_movements m
       WHERE m.tutor_id = $1
         AND m.occurred_at >= $2
         AND m.occurred_at < $3
         ${studentFilter}
       ORDER BY m.occurred_at DESC, m.created_at DESC`,
      params,
    );

    res.json(result.rows.map(toMovement));
  } catch (err) {
    next(err);
  }
});
